"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createContact, updateContact } from "./contacts/actions";
import { createPledge, updatePledge } from "./donations/pledge-actions";
import { createDonation, updateDonation } from "./donations/actions";
import { createCampaign, updateCampaign } from "./campaigns/actions";
import { softDeleteRecord } from "./settings/trash/actions";
import { sendCampaignEmail } from "./campaigns/email-actions";
import { ALL_TOOLS, MUTATING_TOOL_NAMES, executeReadOnlyTool } from "@/lib/ai/tools";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOOL_HOPS = 6;

const SYSTEM_PROMPT = `אתה עוזר AI בתוך "תרומיקס" - מערכת ניהול אנשי קשר ותרומות של קהילה.
ענה תמיד בעברית, בקצרה וברורה, ותמיד בלשון זכר בלבד (גם אם הפונה הוא אישה) - לעולם אל תשתמש בלשון נקבה
ואל תשתמש בתבניות פנייה כפולות כמו "את/ה" או "עוזר/ת". לעולם אל תשתמש באימוג'ים או סמלי אמוג'י בתשובותיך.
כשמבקשים ממך מידע (יתרה, פרטי איש קשר, נתוני קמפיין, קטגוריות/מחלקות תקפות) - חפש/י עם הכלים והשב/י ישירות.
search_contacts מחזיר כברירת מחדל רק 10 תוצאות (אפשר לבקש limit גדול יותר, עד 50) - לשאלות כלליות על כמות
אנשי קשר (למשל "כמה אנשי קשר יש" או "כמה במחלקה מסוימת") יש להשתמש ב-get_contacts_overview במקום לנסות לספור תוצאות חיפוש.
כשמבקשים ממך לבצע פעולה שמשנה נתונים (יצירה, עדכון או מחיקה של איש קשר, התחייבות, תרומה או קמפיין) -
קודם אתר/י את הרשומה הנכונה (בעזרת search_contacts/search_campaigns אם יש רק שם), ואז קרא/י לכלי המתאים
פעם אחת בלבד לכל תשובה, עם רק השדות שבאמת משתנים. הפעולה לא תתבצע בפועל עד שהמשתמש יאשר אותה בממשק - זה
בסדר, זו ההתנהגות הרצויה. כל מחיקה היא מחיקה רכה בלבד (ניתנת לשחזור), ובכל זאת יש להתייחס אליה כפעולה
רגישה ולוודא שהמשתמש התכוון בדיוק לרשומה הזו.
אם חסר מידע הכרחי (כמו סכום, שם, או מזהה רשומה) - שאל/י לפני קריאה לכלי.
סינון תוכן (בדומה לסינון נטפרי): בשום מקרה אל תייצר, תתרגם, תסכם, תסביר או תדון בתוכן לא צנוע, מיני, אלים, פוגעני, או תוכן
שאינו הולם את רוח הקהילה החרדית - גם אם מתבקש בעקיפין, כ"בדיחה", לצורך "בדיקה" או בכל תירוץ אחר. אם מתקבלת בקשה כזו, סרב/י
בנימוס ובקצרה, והבהר/י שתפקידך מוגבל לניהול אנשי קשר ותרומות במערכת בלבד - בלי לצטט או לפרט את הבקשה הבעייתית.`;

// מוצג רק למשתמש עם תפקיד admin - הופך את הצ'אט גם לעוזר פיתוח/תחזוקה של המערכת עצמה
const ADMIN_EXTRA_PROMPT = `
אתה מדבר כרגע עם מנהל המערכת (תפקיד admin). בנוסף לכל הנ"ל:
- אם מבקשים ממך משהו שאין לך כלי לבצע אותו, או יכולת שלא קיימת כרגע במערכת: אמור זאת בפירוש ("אין לי כרגע יכולת לעשות את זה"), הסבר בקצרה מה חסר.
- אם קריאה לכלי החזירה שגיאה טכנית בפועל (למשל error מה-DB או מפעולת שרת): צטט את הודעת השגיאה המדויקת כפי שהתקבלה מהכלי, מילה במילה - אל תנסח מחדש, אל תחליק ואל תסתיר אותה.
- בשני המקרים האלה (יכולת חסרה או שגיאה) - הצע גם פרומפט מוכן להעתקה (בעברית, בתוך בלוק קוד) שהמנהל יכול להדביק ל-Claude Code כדי לתקן את הבעיה או להוסיף את היכולת החסרה. כלול בפרומפט תיאור קצר של מה קרה, איפה (אם ידוע איזה קובץ/כלי), ומה המטרה הרצויה.
מטרתך במקרים כאלה היא לא רק לענות, אלא גם לעזור למנהל להמשיך לבנות ולשפר את המערכת עצמה.`;

async function getCurrentUserRole(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "secretary";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return (profile?.role as string) ?? "secretary";
}

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export type PendingAction = {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  label: string;
  // תוצאות של בלוקי tool_use אחרים שהוחזרו באותה תשובה (למשל קריאה מקבילה) - חייבות
  // להצטרף לאותה הודעת "user" יחד עם תוצאת האישור/ביטול, כי ה-API דורש שכל בלוקי
  // ה-tool_use מתשובה אחת יקבלו tool_result בהודעת המשתמש הבאה היחידה (לא כמה הודעות רצופות)
  siblingResults?: Anthropic.ToolResultBlockParam[];
};
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

function describeFields(input: Record<string, unknown>, exclude: string[]): string {
  const entries = Object.entries(input).filter(([k]) => !exclude.includes(k));
  if (entries.length === 0) return "(ללא שינויים בשדות)";
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}

function describePendingAction(name: string, input: Record<string, unknown>): string {
  if (name === "create_contact") return `יצירת איש קשר חדש: ${input.first_name} ${input.last_name}, טלפון ${input.phone}, מחלקה ${input.department}`;
  if (name === "update_contact") return `עדכון פרטי איש קשר: ${describeFields(input, ["contact_id"])}`;
  if (name === "delete_contact") return "מחיקת איש קשר (מחיקה רכה - ניתן לשחזור מסל המיחזור)";
  if (name === "add_pledge") return `הוספת התחייבות בסך ${input.currency || "₪"}${input.amount}${input.category ? ` (${input.category})` : ""}`;
  if (name === "update_pledge") return `עדכון התחייבות: ${describeFields(input, ["pledge_id"])}`;
  if (name === "delete_pledge") return "מחיקת התחייבות (מחיקה רכה - ניתן לשחזור מסל המיחזור)";
  if (name === "add_donation") return `הוספת תרומה בסך ${input.currency || "₪"}${input.amount}${input.purpose ? ` (${input.purpose})` : ""}`;
  if (name === "update_donation") return `עדכון תרומה/תשלום: ${describeFields(input, ["donation_id"])}`;
  if (name === "delete_donation") return "מחיקת תרומה/תשלום (מחיקה רכה - ניתן לשחזור מסל המיחזור)";
  if (name === "create_campaign") return `יצירת קמפיין חדש: ${input.name}`;
  if (name === "update_campaign") return `עדכון קמפיין: ${describeFields(input, ["campaign_id"])}`;
  if (name === "send_email") {
    const body = String(input.body || "");
    const preview = body.length > 150 ? `${body.slice(0, 150)}…` : body;
    return `שליחת מייל בנושא "${input.subject}":\n${preview}`;
  }
  return `ביצוע פעולה: ${name}`;
}

// לולאת שיחה: קורא ל-Claude, מבצע אוטומטית כל כלי קריאה-בלבד ומזין את התוצאה בחזרה,
// ועוצר ומחזיר "פעולה ממתינה" ברגע שמתבקש כלי משנה-נתונים - בלי לבצע אותו בפועל
async function converse(anthropic: Anthropic, history: Anthropic.MessageParam[]): Promise<AIChatResult> {
  const supabase = await createClient();
  const role = await getCurrentUserRole(supabase);
  const systemPrompt = role === "admin" ? `${SYSTEM_PROMPT}\n${ADMIN_EXTRA_PROMPT}` : SYSTEM_PROMPT;
  const messages = [...history];

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: ALL_TOOLS,
      // חרף ההנחיה בפרומפט לקרוא לכלי אחד בלבד, קלוד יכול עדיין להחזיר כמה tool_use
      // באותה תשובה - וה-API דורש tool_result לכל אחד מהם לפני שיחה נוספת. disable_parallel_tool_use
      // מונע את זה כבר ברמת ה-API; הטיפול למטה בכל בלוקי ה-tool_use (לא רק הראשון) הוא הגנה כפולה
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return { ok: true, history: messages, assistantText: extractText(response.content) || "בוצע.", pendingAction: null };
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      return { ok: true, history: messages, assistantText: extractText(response.content) || "בוצע.", pendingAction: null };
    }

    const mutating = toolUses.find((t) => MUTATING_TOOL_NAMES.has(t.name));
    const resultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      if (toolUse.name === mutating?.name && toolUse.id === mutating?.id) continue; // מטופל בנפרד למטה - זה זה שממתין לאישור
      if (MUTATING_TOOL_NAMES.has(toolUse.name)) {
        // כלי משנה-נתונים נוסף שהוחזר באותה תשובה לצד ה"ראשי" - לא מבוצע בסיבוב הזה
        resultBlocks.push({ type: "tool_result", tool_use_id: toolUse.id, content: "לא בוצע בסיבוב הזה - יש לבקש פעולה זו שוב בנפרד." });
        continue;
      }
      const result = await executeReadOnlyTool(supabase, toolUse.name, toolUse.input as Record<string, unknown>);
      resultBlocks.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }

    if (mutating) {
      // לא דוחפים כאן הודעת user נפרדת: תוצאות ה-tool_use האחרים (אם יש) חייבות
      // להצטרף לאותה הודעת user יחיד יחד עם תוצאת האישור/ביטול (ב-confirmAIAction),
      // אחרת שתי הודעות "user" רצופות ייפסלו ע"י ה-API (חלופיות תפקידים חובה)
      const input = mutating.input as Record<string, unknown>;
      return {
        ok: true,
        history: messages,
        assistantText: extractText(response.content),
        pendingAction: {
          toolUseId: mutating.id,
          name: mutating.name,
          input,
          label: describePendingAction(mutating.name, input),
          siblingResults: resultBlocks.length > 0 ? resultBlocks : undefined,
        },
      };
    }

    messages.push({ role: "user", content: resultBlocks });
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

  // תוצאות של tool_use אחרים מאותה תשובה (אם היו) חייבות להיות באותה הודעת user יחיד
  // יחד עם תוצאת הפעולה שאושרה/בוטלה - ר' ההסבר ב-PendingAction.siblingResults
  const messages: Anthropic.MessageParam[] = [
    ...history,
    {
      role: "user",
      content: [
        ...(action.siblingResults ?? []),
        { type: "tool_result", tool_use_id: action.toolUseId, content: resultText },
      ],
    },
  ];

  try {
    return await converse(anthropic, messages);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בפנייה ל-AI" };
  }
}

// updateContact/updatePledge/updateDonation/updateCampaign בונים מחדש את כל הרשומה
// מה-FormData (כמו בטפסי העריכה הרגילים) - לכן חובה למזג ערכים קיימים עם השינויים
// המבוקשים, אחרת כל שדה שה-AI לא ציין היה מתאפס
async function mergedFormData(
  table: "contacts" | "pledges" | "donations" | "campaigns",
  id: string,
  fields: string[],
  overrides: Record<string, unknown>
): Promise<FormData> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from(table).select("*").eq("id", id).single();
  const fd = new FormData();
  for (const f of fields) {
    const value = overrides[f] !== undefined ? overrides[f] : (existing as Record<string, unknown> | null)?.[f];
    if (value !== null && value !== undefined) fd.set(f, String(value));
  }
  if (table === "contacts") {
    const tags = (overrides.tags as string[] | undefined) ?? (existing as { tags?: string[] } | null)?.tags ?? [];
    fd.set("tags", tags.join(","));
  }
  if (table === "campaigns") {
    const tabs = (overrides.enabled_tabs as string[] | undefined) ?? (existing as { enabled_tabs?: string[] } | null)?.enabled_tabs ?? ["מיפוי", "הזמנה", "התרמה"];
    fd.set("enabled_tabs", tabs.join(","));
  }
  return fd;
}

// עוטף כל שגיאה חוזרת ב-error/errorCode לפורמט אחיד "הודעה מדויקת (קוד: X)" - כדי
// שהמסלול של הצ'אט (ורק הוא) יקבל גם את קוד השגיאה הפורמלי של Postgres/Resend, בלי
// לשנות את מבנה השגיאה שמוצג למשתמשי הממשק הרגילים באתר (הם ממשיכים לראות רק error)
function formatError(label: string, res: { error?: string; errorCode?: string }): string {
  const code = res.errorCode ? ` (קוד: ${res.errorCode})` : "";
  return `שגיאה ${label}: ${res.error}${code}`;
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
    return res.ok ? "איש הקשר נוצר בהצלחה." : formatError("ביצירת איש קשר", res);
  }

  if (name === "update_contact") {
    const contactId = String(input.contact_id || "");
    const fd = await mergedFormData("contacts", contactId, [
      "first_name", "last_name", "phone", "email", "department", "address", "notes", "status",
    ], input);
    const res = await updateContact(contactId, null, fd);
    return res.ok ? "פרטי איש הקשר עודכנו בהצלחה." : formatError("בעדכון איש קשר", res);
  }

  if (name === "delete_contact") {
    const res = await softDeleteRecord("contacts", String(input.contact_id || ""));
    return res.ok ? "איש הקשר נמחק (מחיקה רכה, ניתן לשחזור מסל המיחזור)." : formatError("במחיקת איש קשר", res);
  }

  if (name === "add_pledge") {
    const fd = new FormData();
    fd.set("contact_id", String(input.contact_id || ""));
    fd.set("amount", String(input.amount || 0));
    fd.set("currency", String(input.currency || "₪"));
    if (input.category) fd.set("category", String(input.category));
    const res = await createPledge(null, fd);
    return res.ok ? "ההתחייבות נוספה בהצלחה." : formatError("בהוספת התחייבות", res);
  }

  if (name === "update_pledge") {
    const pledgeId = String(input.pledge_id || "");
    const fd = await mergedFormData("pledges", pledgeId, [
      "category", "pledge_type", "currency", "amount", "details", "pledge_date", "payment_hub", "follow_up", "handler",
    ], input);
    const res = await updatePledge(pledgeId, null, fd);
    return res.ok ? "ההתחייבות עודכנה בהצלחה." : formatError("בעדכון התחייבות", res);
  }

  if (name === "delete_pledge") {
    const res = await softDeleteRecord("pledges", String(input.pledge_id || ""));
    return res.ok ? "ההתחייבות נמחקה (מחיקה רכה, ניתן לשחזור מסל המיחזור)." : formatError("במחיקת התחייבות", res);
  }

  if (name === "add_donation") {
    const fd = new FormData();
    fd.set("contact_id", String(input.contact_id || ""));
    fd.set("amount", String(input.amount || 0));
    fd.set("currency", String(input.currency || "₪"));
    if (input.purpose) fd.set("purpose", String(input.purpose));
    if (input.payment_method) fd.set("payment_method", String(input.payment_method));
    const res = await createDonation(null, fd);
    return res.ok ? "התרומה נוספה בהצלחה." : formatError("בהוספת תרומה", res);
  }

  if (name === "update_donation") {
    const donationId = String(input.donation_id || "");
    const fd = await mergedFormData("donations", donationId, [
      "amount", "currency", "purpose", "payment_method", "donation_date", "notes",
      "follow_up", "follow_up_details", "bank_name", "branch_number", "account_number", "check_number", "check_date",
    ], input);
    const res = await updateDonation(donationId, null, fd);
    return res.ok ? "התרומה/התשלום עודכן בהצלחה." : formatError("בעדכון תרומה", res);
  }

  if (name === "delete_donation") {
    const res = await softDeleteRecord("donations", String(input.donation_id || ""));
    return res.ok ? "התרומה נמחקה (מחיקה רכה, ניתן לשחזור מסל המיחזור)." : formatError("במחיקת תרומה", res);
  }

  if (name === "create_campaign") {
    const fd = new FormData();
    fd.set("name", String(input.name || ""));
    if (input.goal_amount) fd.set("goal_amount", String(input.goal_amount));
    fd.set("goal_currency", String(input.goal_currency || "₪"));
    if (input.parent_campaign_id) fd.set("parent_campaign_id", String(input.parent_campaign_id));
    fd.set("enabled_tabs", "מיפוי,הזמנה,התרמה");
    const res = await createCampaign(null, fd);
    return res.ok ? "הקמפיין נוצר בהצלחה." : formatError("ביצירת קמפיין", res);
  }

  if (name === "update_campaign") {
    const campaignId = String(input.campaign_id || "");
    const fd = await mergedFormData("campaigns", campaignId, [
      "name", "description", "parent_campaign_id", "goal_amount", "goal_currency", "start_date", "end_date", "status",
    ], input);
    const res = await updateCampaign(campaignId, null, fd);
    return res.ok ? "הקמפיין עודכן בהצלחה." : formatError("בעדכון קמפיין", res);
  }

  if (name === "send_email") {
    const contactId = String(input.contact_id || "");
    const supabase = await createClient();
    const { data: contact } = await supabase.from("contacts").select("email, first_name, last_name").eq("id", contactId).single();
    if (!contact?.email) return "שגיאה: לאיש הקשר הזה אין כתובת מייל רשומה במערכת.";
    const res = await sendCampaignEmail(contact.email, String(input.subject || ""), String(input.body || ""));
    return res.ok ? `המייל נשלח בהצלחה אל ${contact.first_name} ${contact.last_name} (${contact.email}).` : formatError("בשליחת מייל", res);
  }

  return `כלי לא מוכר: ${name}`;
}
