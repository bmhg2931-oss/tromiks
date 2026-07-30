import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { getContactBalances, formatOpenBalance } from "@/lib/pledgeBalance";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { stripLeadingZeros } from "@/lib/validation";
import { computeContactRestrictions, redactContactFields, type FieldVisibilityRule } from "@/lib/contactVisibility";
import type { Contact } from "@/lib/types";

// כלים "קריאה בלבד" - מבוצעים אוטומטית ע"י הצ'אט ללא אישור המשתמש.
// כלים "משנים" (create_contact / update_* / delete_* / add_pledge / add_donation / *_campaign)
// לא מבוצעים כאן בכלל - הם מוחזרים ל-UI כ"פעולה ממתינה" ומבוצעים רק אחרי אישור מפורש
// בלחיצת כפתור. מחיקות הן תמיד מחיקה רכה (deleted_at) הניתנת לשחזור מסל המיחזור.

export const READ_ONLY_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_contacts",
    description: "חיפוש אנשי קשר לפי שם ו/או טלפון. מחזיר עד 10 תוצאות כברירת מחדל (אפשר לבקש limit גדול יותר, עד 50, אם יש הרבה התאמות ורוצים סקירה רחבה יותר).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "מילת חיפוש - שם פרטי, שם משפחה או טלפון" },
        limit: { type: "number", description: "כמה תוצאות להחזיר לכל היותר (ברירת מחדל 10, מקסימום 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_contacts_overview",
    description: "סקירה כוללת של כל אנשי הקשר במערכת: סך הכל, פילוח לפי סטטוס (פעיל/לא פעיל) ולפי מחלקה/קהילה. שימושי לשאלות כלליות כמו 'כמה אנשי קשר יש' או 'כמה במחלקה X' - בלי צורך לרשום כל שם בנפרד.",
    input_schema: {
      type: "object",
      properties: { department: { type: "string", description: "אופציונלי - לצמצם את הסקירה למחלקה/קהילה ספציפית" } },
      required: [],
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
  {
    name: "get_campaign_details",
    description: "פרטים מלאים על קמפיין לפי מזהה: יעד, סטטוס, תיאור ותתי-קמפיינים. יש לאתר את המזהה קודם עם search_campaigns.",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "list_reference_data",
    description: "רשימת ערכים תקפים במערכת: קטגוריות תרומה, גורמים מטפלים, ומחלקות/קהילות - שימושי לפני יצירת/עדכון איש קשר או התחייבות.",
    input_schema: { type: "object", properties: {}, required: [] },
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
    name: "update_contact",
    description: "עדכון פרטי איש קשר קיים. יש לציין רק את השדות שרוצים לשנות - שאר השדות יישארו כפי שהיו.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        department: { type: "string" },
        address: { type: "string" },
        notes: { type: "string" },
        status: { type: "string" },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "delete_contact",
    description: "מחיקת איש קשר. זו מחיקה רכה בלבד - האיש קשר עובר לסל מיחזור וניתן לשחזור, לא נמחק לצמיתות.",
    input_schema: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] },
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
    name: "update_pledge",
    description: "עדכון התחייבות (נדו\"ן) קיימת. יש לציין רק את השדות לשינוי.",
    input_schema: {
      type: "object",
      properties: {
        pledge_id: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        category: { type: "string" },
        details: { type: "string" },
      },
      required: ["pledge_id"],
    },
  },
  {
    name: "delete_pledge",
    description: "מחיקת התחייבות. מחיקה רכה בלבד, ניתנת לשחזור מסל המיחזור.",
    input_schema: { type: "object", properties: { pledge_id: { type: "string" } }, required: ["pledge_id"] },
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
  {
    name: "update_donation",
    description: "עדכון תרומה/תשלום קיים. יש לציין רק את השדות לשינוי.",
    input_schema: {
      type: "object",
      properties: {
        donation_id: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        purpose: { type: "string" },
        notes: { type: "string" },
      },
      required: ["donation_id"],
    },
  },
  {
    name: "delete_donation",
    description: "מחיקת תרומה/תשלום. מחיקה רכה בלבד, ניתנת לשחזור מסל המיחזור.",
    input_schema: { type: "object", properties: { donation_id: { type: "string" } }, required: ["donation_id"] },
  },
  {
    name: "create_campaign",
    description: "יצירת קמפיין גיוס חדש, או תת-קמפיין אם מסופק parent_campaign_id.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal_amount: { type: "number" },
        goal_currency: { type: "string" },
        parent_campaign_id: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_campaign",
    description: "עדכון קמפיין קיים. יש לציין רק את השדות לשינוי.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        name: { type: "string" },
        goal_amount: { type: "number" },
        goal_currency: { type: "string" },
        status: { type: "string" },
        description: { type: "string" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "send_email",
    description: "שליחת מייל אמיתי לאיש קשר קיים (לפי כתובת המייל הרשומה שלו במערכת). יש לאתר את איש הקשר קודם עם search_contacts/get_contact_details.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["contact_id", "subject", "body"],
    },
  },
];

export const ALL_TOOLS: Anthropic.Tool[] = [...READ_ONLY_TOOLS, ...MUTATING_TOOLS];
export const MUTATING_TOOL_NAMES = new Set(MUTATING_TOOLS.map((t) => t.name));

// מביא את התפקיד וכללי הנראות של המשתמש המחובר, כדי שתוצאות הצ'אט יכבדו בדיוק את אותם
// כללי הסתרת-שדות שחלים עליו בשאר המערכת (hide_contact עצמו נאכף כבר ב-RLS ולא כאן)
async function getVisibilityContext(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: "", role: "secretary", rules: [] as FieldVisibilityRule[] };
  const [{ data: profile }, { data: rules }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("contact_visibility_rules").select("tag, scope_type, role, user_id, hide_contact, hidden_fields, hidden_sections"),
  ]);
  return { userId: user.id, role: (profile?.role as string) ?? "secretary", rules: (rules ?? []) as FieldVisibilityRule[] };
}

function redact<T extends { tags?: string[] }>(row: T, rules: FieldVisibilityRule[], userId: string, role: string): T {
  const { hiddenFields } = computeContactRestrictions({ tags: row.tags ?? [] }, rules, userId, role);
  return redactContactFields(row as unknown as Contact, hiddenFields) as unknown as T;
}

export async function executeReadOnlyTool(supabase: SupabaseClient, name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "search_contacts") {
    const query = String(input.query || "").trim();
    const words = query.split(/\s+/).filter(Boolean);
    // חיפוש ברמת ה-DB על כל אנשי הקשר (לא רק מדגם חלקי) - אותה שיטה בדיוק כמו בעמוד
    // אנשי הקשר הראשי: כל מילה חייבת להתאים למשהו (שם פרטי/משפחה/טלפון/אימייל), וכל
    // .or() נוסף מצטרף כ-AND לקודמיו - כך שהחיפוש הוא רב-מילים וללא תלות בסדר
    const { data: rows } = await fetchAllRows<{ id: string; first_name: string; last_name: string; phone: string; department: string | null; email: string | null; tags: string[] }>(
      () => {
        let q = supabase.from("contacts").select("id, first_name, last_name, phone, department, email, tags").is("deleted_at", null);
        for (const word of words) {
          const w = word.replace(/[,()]/g, "");
          const phoneWord = stripLeadingZeros(w);
          q = q.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,phone.ilike.%${phoneWord}%,email.ilike.%${w}%`);
        }
        return q;
      }
    );
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50);
    const totalMatches = (rows ?? []).length;
    const top = (rows ?? []).slice(0, limit);
    const balances = await getContactBalances(supabase);
    const { userId, role, rules } = await getVisibilityContext(supabase);
    const results = top.map((c) => {
      const r = redact(c, rules, userId, role);
      return {
        contact_id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        phone: r.phone,
        department: r.department,
        open_balance: formatOpenBalance(balances.get(c.id) || 0),
      };
    });
    return { total_matches: totalMatches, showing: results.length, results };
  }

  if (name === "get_contacts_overview") {
    const department = String(input.department || "").trim();
    const { data: rows } = await fetchAllRows<{ status: string; department: string | null }>(() => {
      let q = supabase.from("contacts").select("status, department").is("deleted_at", null);
      if (department) q = q.eq("department", department);
      return q;
    });
    const all = rows ?? [];
    const byDepartment = new Map<string, number>();
    let active = 0;
    for (const c of all) {
      if (c.status === "פעיל") active++;
      const dept = c.department || "ללא מחלקה";
      byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + 1);
    }
    return {
      total: all.length,
      active,
      inactive: all.length - active,
      by_department: Object.fromEntries(byDepartment),
    };
  }

  if (name === "get_contact_details") {
    const contactId = String(input.contact_id || "");
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, department, address, tags")
      .eq("id", contactId)
      .single();
    if (!contact) return { error: "איש קשר לא נמצא" };
    const { userId, role, rules } = await getVisibilityContext(supabase);
    const c = redact(contact, rules, userId, role);
    const balances = await getContactBalances(supabase);
    const [{ data: pledges }, { data: donations }] = await Promise.all([
      supabase.from("pledges").select("id, amount, currency, pledge_date, category, status").eq("contact_id", contactId).is("deleted_at", null).order("pledge_date", { ascending: false }).limit(5),
      supabase.from("donations").select("id, amount, currency, donation_date, purpose").eq("contact_id", contactId).is("deleted_at", null).order("donation_date", { ascending: false }).limit(5),
    ]);
    return {
      contact_id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
      email: c.email,
      department: c.department,
      address: c.address,
      open_balance: formatOpenBalance(balances.get(c.id) || 0),
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

  if (name === "get_campaign_details") {
    const campaignId = String(input.campaign_id || "");
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, name, description, goal_amount, goal_currency, status, parent_campaign_id")
      .eq("id", campaignId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!campaign) return { error: "קמפיין לא נמצא" };
    const { data: children } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("parent_campaign_id", campaignId)
      .is("deleted_at", null);
    return { ...campaign, sub_campaigns: children ?? [] };
  }

  if (name === "list_reference_data") {
    const [{ data: categories }, { data: handlers }, { data: deptRows }] = await Promise.all([
      supabase.from("donation_categories").select("name").eq("active", true).is("deleted_at", null).order("sort_order"),
      supabase.from("donation_handlers").select("name").eq("active", true).is("deleted_at", null).order("sort_order"),
      supabase.from("contacts").select("department").not("department", "is", null).is("deleted_at", null),
    ]);
    const departments = Array.from(new Set((deptRows ?? []).map((r) => r.department).filter(Boolean))).sort();
    return {
      categories: (categories ?? []).map((c) => c.name),
      handlers: (handlers ?? []).map((h) => h.name),
      departments,
    };
  }

  return { error: `כלי לא מוכר: ${name}` };
}
