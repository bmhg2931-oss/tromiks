export type UserRole = "admin" | "treasurer" | "secretary" | "rabbi" | "gabai";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "מנהל מערכת",
  treasurer: "גזבר / ועד כספים",
  secretary: "מזכירות",
  rabbi: 'רב / הנהלת ביהכ"נ',
  gabai: "גבאי / מתנדב",
};

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  approved: boolean;
  is_super_admin: boolean;
  default_payment_hub: string;
  default_currency: string;
};

export type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  spouse_name: string | null;
  id_number: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  contact_type: string;
  department: string | null;
  status: string;
  joined_date: string | null;
  memorial_date: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  title: string | null;
  street: string | null;
  house_number: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  mobile_secondary: string | null;
  home_phone: string | null;
  wife_mobile: string | null;
  email_secondary: string | null;
  full_name_with_mother: string | null;
  full_name_with_father: string | null;
  mailing_name: string | null;
  deleted_at: string | null;
};

export type ContactFieldSection = "כללי" | "מגורים" | "פרטי קשר" | "פרטים נוספים" | "סיווג במערכת";

export type ContactFieldDef = {
  key: string;
  label: string;
  section: ContactFieldSection;
};

// שדות שניתן להציג/להסתיר בעמודות מסך אנשי הקשר (מנוהל דרך הגדרות > תצוגת שדות)
export const CONTACT_FIELD_DEFS: ContactFieldDef[] = [
  { key: "phone", label: 'סלולארי ראשי (ID)', section: "כללי" },
  { key: "title", label: "תואר", section: "כללי" },
  { key: "last_name", label: "שם משפחה", section: "כללי" },
  { key: "first_name", label: "שם פרטי", section: "כללי" },
  { key: "spouse_name", label: "שם בת הזוג", section: "כללי" },
  { key: "address", label: "כתובת", section: "מגורים" },
  { key: "country", label: "ארץ", section: "מגורים" },
  { key: "postal_code", label: "מיקוד", section: "מגורים" },
  { key: "mobile_secondary", label: "סלולארי נוסף", section: "פרטי קשר" },
  { key: "home_phone", label: "טלפון בית", section: "פרטי קשר" },
  { key: "wife_mobile", label: "פלאפון נשים", section: "פרטי קשר" },
  { key: "email", label: 'אימייל', section: "פרטי קשר" },
  { key: "email_secondary", label: "אימייל נוסף", section: "פרטי קשר" },
  { key: "updated_at", label: "עדכון אחרון", section: "פרטים נוספים" },
  { key: "full_name_with_mother", label: "שם מלא עם שם האם", section: "פרטים נוספים" },
  { key: "full_name_with_father", label: "שם מלא עם שם האב", section: "פרטים נוספים" },
  { key: "notes", label: "הערות", section: "פרטים נוספים" },
  { key: "mailing_name", label: "שם לדיוור", section: "פרטים נוספים" },
  { key: "id_number", label: 'ת.ז. / מספר עוסק', section: "סיווג במערכת" },
  { key: "department", label: "שיוך למחלקה", section: "סיווג במערכת" },
  { key: "status", label: "סטטוס", section: "סיווג במערכת" },
  { key: "joined_date", label: "תאריך הצטרפות", section: "סיווג במערכת" },
  { key: "tags", label: "תגיות", section: "סיווג במערכת" },
  { key: "open_balance", label: "יתרה פתוחה", section: "סיווג במערכת" },
];

export const DEFAULT_VISIBLE_FIELDS = [
  "phone",
  "first_name",
  "last_name",
  "email",
  "department",
  "status",
  "tags",
  "open_balance",
];

export type Donation = {
  id: string;
  contact_id: string;
  pledge_id: string | null;
  campaign_id: string | null;
  amount: number;
  currency: string;
  donation_date: string;
  purpose: string;
  payment_method: string;
  payment_hub: string | null;
  recurrence: string;
  status: string;
  source: string;
  notes: string | null;
  follow_up: string | null;
  follow_up_details: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  check_number: string | null;
  check_date: string | null;
  created_at: string;
  contacts?: { first_name: string; last_name: string } | null;
};

export type Pledge = {
  id: string;
  contact_id: string;
  category: string | null;
  campaign_id: string | null;
  pledge_type: string;
  currency: string;
  amount: number;
  details: string | null;
  pledge_date: string;
  payment_hub: string | null;
  follow_up: string | null;
  handler: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  contacts?: { first_name: string; last_name: string } | null;
};

export type CampaignStatus = "פעיל" | "הושלם" | "בארכיון";
export const CAMPAIGN_STATUSES: CampaignStatus[] = ["פעיל", "הושלם", "בארכיון"];

export type Campaign = {
  id: string;
  name: string;
  description: string | null;
  parent_campaign_id: string | null;
  goal_amount: number | null;
  goal_currency: string;
  start_date: string | null;
  end_date: string | null;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
};

export function canSeeCampaigns(role: UserRole) {
  return role !== "gabai";
}
export function canEditCampaigns(role: UserRole) {
  return role === "admin" || role === "treasurer" || role === "secretary";
}
export function canDeleteCampaigns(role: UserRole) {
  return role === "admin" || role === "treasurer";
}

export type UnifiedDonationRow = {
  id: string;
  contact_id: string;
  contactName: string;
  contactPhone: string;
  contactCity: string | null;
  contactExtra: Record<string, unknown> | null;
  date: string;
  recordType: "pledge" | "payment" | "combined";
  // חובה = סכום ההתחייבות (אם קיימת), זכות = סכום התשלום בפועל (אם קיים) - עם מטבע נפרד
  // לכל צד, כי תשלום עשוי להיות במטבע שונה מההתחייבות שהוא מכסה
  debitAmount: number | null;
  debitCurrency: string | null;
  creditAmount: number | null;
  creditCurrency: string | null;
  paymentMethod: string | null;
  handler: string | null;
  category: string | null;
  paymentHub: string | null;
  status: string | null;
  notes: string | null;
  pledge?: Pledge;
  donation?: Donation;
};

export type DonationFieldDef = { key: string; label: string };

// שדות פרטי איש קשר נוספים (מלבד טלפון/שם פרטי/שם משפחה/עיר שכבר מטופלים בנפרד) הזמינים
// כעמודות אופציונליות במסך תרומות ותשלומים, עם המפתח contact_<key> כדי לא להתנגש עם שדות
// תרומה/התחייבות בעלי שם דומה (למשל status/notes)
const EXTRA_CONTACT_FIELD_DEFS = CONTACT_FIELD_DEFS.filter(
  (f) => !["phone", "first_name", "last_name", "city"].includes(f.key)
).map((f) => ({ key: `contact_${f.key}`, label: f.label }));

// שדות שניתן להציג/להסתיר כעמודות במסך תרומות ותשלומים (מנוהל דרך הגדרות > תצוגת רשימה).
// סוג רשומה, שם תורם וסכום מוצגים תמיד ולכן אינם ברשימה כאן. הטלפון אינו ברשימה כי הוא
// מוצג כלחצן חיוג קבוע לצד השם, לא כעמודת טקסט נפרדת.
export const DONATION_FIELD_DEFS: DonationFieldDef[] = [
  { key: "date", label: "תאריך לועזי" },
  { key: "hebrew_date", label: "תאריך עברי" },
  { key: "city", label: "עיר" },
  { key: "category", label: "קטגוריה" },
  { key: "payment_hub", label: "מוקד תשלום" },
  { key: "payment_method", label: "אופן תשלום" },
  { key: "status", label: "סטטוס" },
  { key: "notes", label: "הערות" },
  { key: "handler", label: "מטפל" },
  ...EXTRA_CONTACT_FIELD_DEFS,
];

export const DEFAULT_VISIBLE_DONATION_FIELDS = ["date", "payment_method", "handler"];

// סדר הצגה קבוע של כל עמודות מסך תרומות ותשלומים (חובה + אופציונליות יחד).
// "סוג רשומה" מוצג בנפרד תמיד ראשון ואינו חלק מהרשימה הזו. שדות פרטי איש הקשר הנוספים
// (contact_*) מתווספים בסוף, אחרי "מטפל".
export const DONATION_COLUMN_ORDER = [
  "date",
  "name",
  "city",
  "category",
  "debit",
  "credit",
  "payment_hub",
  "payment_method",
  "status",
  "notes",
  "handler",
  ...EXTRA_CONTACT_FIELD_DEFS.map((f) => f.key),
];

export const DONATION_COLUMN_LABELS: Record<string, string> = {
  date: "תאריך",
  name: "שם מלא",
  city: "עיר",
  category: "קטגוריה",
  debit: "חובה",
  credit: "זכות",
  payment_hub: "מוקד תשלום",
  payment_method: "אופן תשלום",
  status: "סטטוס",
  notes: "הערות",
  handler: "מטפל",
  ...Object.fromEntries(EXTRA_CONTACT_FIELD_DEFS.map((f) => [f.key, f.label])),
};

export const DONATION_MANDATORY_COLUMNS = new Set(["name", "debit", "credit"]);

export const PAYMENT_HUB_COLORS: Record<string, string> = {
  "ישראל": "bg-sage/15 text-sage",
  'ארה"ב': "bg-[#e3e6f2] text-[#3a4a8f]",
  "אנגליה": "bg-[#f3e9d2] text-[#8a6415]",
  "שווייץ": "bg-[#f4e1e1] text-wine",
  "בלגיה": "bg-[#eadcf5] text-[#6b3fa0]",
};

export const PURPOSES = ["כללי", "בניין", "כשרות", "חינוך", "ביקור חולים", "אחר"];
export const DEPARTMENTS = ['אנ"ש ארץ ישראל', 'אנ"ש חוץ לארץ', "אוהדים ומקורבים", "תורמים מזדמנים"];
export const PAY_METHODS = ["מזומן", "צ'ק", "כרטיס אשראי", "העברה בנקאית", "הוראת קבע", "ביט"];
export const RECURRENCE = ["חד-פעמי", "חודשי", "רבעוני", "שנתי"];
export const CONTACT_STATUSES = ["פעיל", "לא פעיל", "ממתין לאישור", "לא ידוע"];
export const DONATION_STATUSES = ["שולם", "ממתין", "נכשל", "בוטל", "מוחזר"];

export const PLEDGE_TYPES = ['תרומה חד"פ', "הוראת קבע"];
export const PLEDGE_STATUSES = ["פתוח", "שולם", "שולם חלקית", "בוטל"];
export const CURRENCIES = ["₪", "$", "€", "£"];
export const EXTRA_CURRENCIES = ["CHF", "CAD", "JPY", "AUD", "DKK", "NOK", "ZAR", "SEK", "JOD", "LBP", "EGP"];
export const ALL_CURRENCIES = [...CURRENCIES, ...EXTRA_CURRENCIES];
export const PAYMENT_HUBS = ["ישראל", 'ארה"ב', "אנגליה", "שווייץ", "בלגיה"];

export function canSeePledges(role: UserRole) {
  return role !== "gabai";
}
export function canEditPledges(role: UserRole) {
  return role === "admin" || role === "treasurer" || role === "secretary";
}
export function canDeletePledges(role: UserRole) {
  return role === "admin" || role === "treasurer";
}

export function canEditContacts(role: UserRole) {
  return role === "admin" || role === "treasurer" || role === "secretary";
}
export function canDeleteContacts(role: UserRole) {
  return role === "admin" || role === "treasurer";
}
export function canEditDonations(role: UserRole) {
  return role === "admin" || role === "treasurer" || role === "secretary";
}
export function canDeleteDonations(role: UserRole) {
  return role === "admin" || role === "treasurer";
}
export function canSeeDonations(role: UserRole) {
  return role !== "gabai";
}
export function canSeeReports(role: UserRole) {
  return role === "admin" || role === "treasurer";
}
