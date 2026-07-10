import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { getContactBalances, formatOpenBalance } from "@/lib/pledgeBalance";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { stripLeadingZeros } from "@/lib/validation";

// כלים "קריאה בלבד" - מבוצעים אוטומטית ע"י הצ'אט ללא אישור המשתמש.
// כלים "משנים" (create_contact / add_pledge / add_donation) לא מבוצעים כאן בכלל -
// הם מוחזרים ל-UI כ"פעולה ממתינה" ומבוצעים רק אחרי אישור מפורש בלחיצת כפתור.

export const READ_ONLY_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_contacts",
    description: "חיפוש אנשי קשר לפי שם ו/או טלפון. מחזיר עד 10 תוצאות עם יתרה פתוחה.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "מילת חיפוש - שם פרטי, שם משפחה או טלפון" } },
      required: ["query"],
    },
  },
  {
    name: "get_contact_details",
    description: "פרטים מלאים על איש קשר לפי מזהה: פרטי קשר, יתרה פתוחה, 5 התרומות/התחייבויות האחרונות.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },
  {
    name: "search_campaigns",
    description: "חיפוש קמפיינים לפי שם. מחזיר יעד וסכום שגויס עד כה.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "מילת חיפוש בשם הקמפיין, אפשר להשאיר ריק לרשימה מלאה" } },
      required: [],
    },
  },
];

export const MUTATING_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_contact",
    description: "יצירת איש קשר חדש במערכת. יש להשתמש רק אחרי שהמשתמש אישר את הפעולה.",
    input_schema: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone: { type: "string" },
        department: { type: "string", description: "מחלקה/קהילה - שדה חובה" },
        email: { type: "string" },
      },
      required: ["first_name", "last_name", "phone", "department"],
    },
  },
  {
    name: "add_pledge",
    description: "הוספת התחייבות (נדו\"ן) לאיש קשר קיים, ללא תשלום בפועל.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", description: "סימן מטבע, למשל ₪ או $. ברירת מחדל ₪" },
        category: { type: "string" },
      },
      required: ["contact_id", "amount"],
    },
  },
  {
    name: "add_donation",
    description: "הוספת תרומה/תשלום בפועל לאיש קשר קיים (לא התחייבות).",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", description: "סימן מטבע, למשל ₪ או $. ברירת מחדל ₪" },
        purpose: { type: "string", description: "מטרת התרומה / קטגוריה" },
        payment_method: { type: "string", description: "אחת מ: מזומן, כרטיס אשראי, המחאה, העברה בנקאית, הוראת קבע" },
      },
      required: ["contact_id", "amount"],
    },
  },
];

export const ALL_TOOLS: Anthropic.Tool[] = [...READ_ONLY_TOOLS, ...MUTATING_TOOLS];
export const MUTATING_TOOL_NAMES = new Set(MUTATING_TOOLS.map((t) => t.name));

export async function executeReadOnlyTool(supabase: SupabaseClient, name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "search_contacts") {
    const query = String(input.query || "").trim();
    const words = query.split(/\s+/).filter(Boolean);
    // חיפוש ברמת ה-DB על כל אנשי הקשר (לא רק 200 הראשונים) - אותה שיטה בדיוק כמו בעמוד
    // אנשי הקשר הראשי: כל מילה חייבת להתאים למשהו (שם פרטי/משפחה/טלפון/אימייל), וכל
    // .or() נוסף מצטרף כ-AND לקודמיו - כך שהחיפוש הוא רב-מילים וללא תלות בסדר
    const { data: rows } = await fetchAllRows<{ id: string; first_name: string; last_name: string; phone: string; department: string | null; email: string | null }>(
      () => {
        let q = supabase.from("contacts").select("id, first_name, last_name, phone, department, email").is("deleted_at", null);
        for (const word of words) {
          const w = word.replace(/[,()]/g, "");
          const phoneWord = stripLeadingZeros(w);
          q = q.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,phone.ilike.%${phoneWord}%,email.ilike.%${w}%`);
        }
        return q;
      }
    );
    const top = (rows ?? []).slice(0, 10);
    const balances = await getContactBalances(supabase);
    return top.map((c) => ({
      contact_id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
      department: c.department,
      open_balance: formatOpenBalance(balances.get(c.id) || 0),
    }));
  }

  if (name === "get_contact_details") {
    const contactId = String(input.contact_id || "");
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, department, address")
      .eq("id", contactId)
      .single();
    if (!contact) return { error: "איש קשר לא נמצא" };
    const balances = await getContactBalances(supabase);
    const [{ data: pledges }, { data: donations }] = await Promise.all([
      supabase.from("pledges").select("amount, currency, pledge_date, category, status").eq("contact_id", contactId).order("pledge_date", { ascending: false }).limit(5),
      supabase.from("donations").select("amount, currency, donation_date, purpose").eq("contact_id", contactId).order("donation_date", { ascending: false }).limit(5),
    ]);
    return {
      contact_id: contact.id,
      name: `${contact.first_name} ${contact.last_name}`,
      phone: contact.phone,
      email: contact.email,
      department: contact.department,
      address: contact.address,
      open_balance: formatOpenBalance(balances.get(contact.id) || 0),
      recent_pledges: pledges ?? [],
      recent_donations: donations ?? [],
    };
  }

  if (name === "search_campaigns") {
    const query = String(input.query || "").trim().toLowerCase();
    const { data } = await supabase
      .from("campaigns")
      .select("id, name, goal_amount, goal_currency, status")
      .is("deleted_at", null)
      .limit(50);
    const rows = (data ?? []).filter((c) => !query || c.name.toLowerCase().includes(query));
    return rows.slice(0, 10);
  }

  return { error: `כלי לא מוכר: ${name}` };
}
