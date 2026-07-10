"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createContact } from "./contacts/actions";
import { createPledge } from "./donations/pledge-actions";
import { createDonation } from "./donations/actions";
import { ALL_TOOLS, MUTATING_TOOL_NAMES, executeReadOnlyTool } from "@/lib/ai/tools";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOOL_HOPS = 6;

const SYSTEM_PROMPT = `את/ה עוזר/ת AI בתוך "תרומיקס" - מערכת ניהול אנשי קשר ותרומות של קהילה.
ענה/י תמיד בעברית, בקצרה וברורה.
כשמבקשים ממך מידע (יתרה, פרטי איש קשר, נתוני קמפיין) - חפש/י עם הכלים והשב/י ישירות.
כשמבקשים ממך לבצע פעולה שמשנה נתונים (הוספת איש קשר, התחייבות או תרומה) - קודם אתר/י את איש הקשר הנכון (בעזרת search_contacts אם יש רק שם), ואז קרא/י לכלי המתאים פעם אחת בלבד לכל תשובה. הפעולה לא תתבצע בפועל עד שהמשתמש יאשר אותה בממשק - זה בסדר, זו ההתנהגות הרצויה.
אם חסר מידע הכרחי (כמו סכום או שם) - שאל/י לפני קריאה לכלי.`;

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export type PendingAction = { toolUseId: string; name: string; input: Record<string, unknown>; label: string };
export type AIChatResult =
  | { ok: true; history: Anthropic.MessageParam[]; assistantText: string; pendingAction: PendingAction | null }
  | { ok: false; error: string };

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function describePendingAction(name: string, input: Record<string, unknown>): string {
  if (name === "create_contact") return `יצירת איש קשר חדש: ${input.first_name} ${input.last_name}, טלפון ${input.phone}, מחלקה ${input.department}`;
  if (name === "add_pledge") return `הוספת התחייבות בסך ${input.currency || "₪"}${input.amount}${input.category ? ` (${input.category})` : ""}`;
  if (name === "add_donation") return `הוספת תרומה בסך ${input.currency || "₪"}${input.amount}${input.purpose ? ` (${input.purpose})` : ""}`;
  return `ביצוע פעולה: ${name}`;
}

// לולאת שיחה: קורא ל-Claude, מבצע אוטומטית כל כלי קריאה-בלבד ומזין את התוצאה בחזרה,
// ועוצר ומחזיר "פעולה ממתינה" ברגע שמתבקש כלי משנה-נתונים - בלי לבצע אותו בפועל
async function converse(anthropic: Anthropic, history: Anthropic.MessageParam[]): Promise<AIChatResult> {
  const supabase = await createClient();
  const messages = [...history];

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return { ok: true, history: messages, assistantText: extractText(response.content) || "בוצע.", pendingAction: null };
    }

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) {
      return { ok: true, history: messages, assistantText: extractText(response.content) || "בוצע.", pendingAction: null };
    }

    if (MUTATING_TOOL_NAMES.has(toolUse.name)) {
      const input = toolUse.input as Record<string, unknown>;
      return {
        ok: true,
        history: messages,
        assistantText: extractText(response.content),
        pendingAction: { toolUseId: toolUse.id, name: toolUse.name, input, label: describePendingAction(toolUse.name, input) },
      };
    }

    const result = await executeReadOnlyTool(supabase, toolUse.name, toolUse.input as Record<string, unknown>);
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) }],
    });
  }

  return { ok: true, history: messages, assistantText: "מצטער, לא הצלחתי לסיים את הבקשה. נסה/י לנסח אחרת.", pendingAction: null };
}

export async function runAIChat(history: Anthropic.MessageParam[]): Promise<AIChatResult> {
  const anthropic = client();
  if (!anthropic) return { ok: false, error: "לא הוגדר מפתח ANTHROPIC_API_KEY בקובץ .env.local" };
  try {
    return await converse(anthropic, history);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בפנייה ל-AI" };
  }
}

// מבצע בפועל פעולה משנה-נתונים לאחר אישור המשתמש בממשק, ואז ממשיך את השיחה
// כדי לתת ל-AI לנסח תגובה טבעית (או שולח תוצאת ביטול אם המשתמש דחה)
export async function confirmAIAction(
  history: Anthropic.MessageParam[],
  action: PendingAction,
  approved: boolean
): Promise<AIChatResult> {
  const anthropic = client();
  if (!anthropic) return { ok: false, error: "לא הוגדר מפתח ANTHROPIC_API_KEY בקובץ .env.local" };

  let resultText: string;
  if (!approved) {
    resultText = "המשתמש ביטל את הפעולה.";
  } else {
    try {
      resultText = await executeAction(action.name, action.input);
    } catch (e) {
      resultText = `שגיאה בביצוע: ${e instanceof Error ? e.message : "שגיאה לא ידועה"}`;
    }
  }

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: [{ type: "tool_result", tool_use_id: action.toolUseId, content: resultText }] },
  ];

  try {
    return await converse(anthropic, messages);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בפנייה ל-AI" };
  }
}

async function executeAction(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "create_contact") {
    const fd = new FormData();
    fd.set("first_name", String(input.first_name || ""));
    fd.set("last_name", String(input.last_name || ""));
    fd.set("phone", String(input.phone || ""));
    fd.set("department", String(input.department || ""));
    if (input.email) fd.set("email", String(input.email));
    const res = await createContact(null, fd);
    return res.ok ? "איש הקשר נוצר בהצלחה." : `שגיאה ביצירת איש קשר: ${res.error}`;
  }

  if (name === "add_pledge") {
    const fd = new FormData();
    fd.set("contact_id", String(input.contact_id || ""));
    fd.set("amount", String(input.amount || 0));
    fd.set("currency", String(input.currency || "₪"));
    if (input.category) fd.set("category", String(input.category));
    const res = await createPledge(null, fd);
    return res.ok ? "ההתחייבות נוספה בהצלחה." : `שגיאה בהוספת התחייבות: ${res.error}`;
  }

  if (name === "add_donation") {
    const fd = new FormData();
    fd.set("contact_id", String(input.contact_id || ""));
    fd.set("amount", String(input.amount || 0));
    fd.set("currency", String(input.currency || "₪"));
    if (input.purpose) fd.set("purpose", String(input.purpose));
    if (input.payment_method) fd.set("payment_method", String(input.payment_method));
    const res = await createDonation(null, fd);
    return res.ok ? "התרומה נוספה בהצלחה." : `שגיאה בהוספת תרומה: ${res.error}`;
  }

  return `כלי לא מוכר: ${name}`;
}
