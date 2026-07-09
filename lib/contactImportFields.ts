import { CONTACT_FIELD_DEFS, CONTACT_STATUSES, DEPARTMENTS } from "./types";
import { CITIES } from "./cities";
import { EMAIL_RE } from "./validation";

export type ImportFieldOption = { key: string; label: string };

// "כתובת" (address) מוסר בכוונה מרשימת היעדים לייבוא/ייצוא - זהו שדה תצוגה מחושב בלבד
// (מורכב מ-street+house_number+city בעת ההצגה, ר' lib/address.ts), ואינו אמור לקבל נתונים
// ישירות; רחוב/מספר בית/עיר/ארץ מיובאים תמיד כעמודות נפרדות
export const IMPORT_FIELD_OPTIONS: ImportFieldOption[] = [
  { key: "skip", label: "— אל תייבא —" },
  ...CONTACT_FIELD_DEFS.filter((f) => f.key !== "address").map((f) => ({ key: f.key, label: f.label })),
  { key: "department", label: "שיוך למחלקה" },
  { key: "status", label: "סטטוס" },
  { key: "tags", label: "תגיות" },
  { key: "id_number", label: 'ת.ז. / מספר עוסק' },
];

const HEADER_SYNONYMS: Record<string, string[]> = {
  phone: ["טלפון", "נייד", "סלולארי", "טלפון נייד", "מספר טלפון", "phone", "mobile", "cell"],
  first_name: ["שם פרטי", "שם", "first name", "firstname"],
  last_name: ["שם משפחה", "משפחה", "last name", "lastname", "surname"],
  title: ["תואר"],
  spouse_name: ["שם בן הזוג", "שם בת הזוג", "בן זוג", "בת זוג", "spouse"],
  street: ["רחוב", "street"],
  house_number: ["מספר בית", "מספר", "house number"],
  city: ["עיר", "city"],
  country: ["ארץ", "מדינה", "country"],
  postal_code: ["מיקוד", "zip", "postal code"],
  mobile_secondary: ["סלולארי נוסף", "טלפון נוסף"],
  home_phone: ["טלפון בית", "home phone"],
  wife_mobile: ["פלאפון נשים", "נייד אישה"],
  email: ["אימייל", "מייל", "דואל", 'דוא"ל', "email"],
  email_secondary: ["אימייל נוסף", "מייל נוסף"],
  full_name_with_mother: ["שם מלא עם שם האם", "שם עם אם"],
  full_name_with_father: ["שם מלא עם שם האב", "שם עם אב"],
  notes: ["הערות", "notes"],
  mailing_name: ["שם לדיוור"],
  department: ["מחלקה", "שיוך", "department"],
  status: ["סטטוס", "status"],
  tags: ["תגיות", "tags"],
  id_number: ["ת.ז", "תז", "מספר עוסק", "id"],
};

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/["'׳’.]/g, "");
}

export function guessFieldForHeader(header: string): string {
  const normalized = normalize(header);

  // exact matches take priority over substring matches, so a broad synonym
  // like "שם" for first_name doesn't shadow an exact hit like "שם משפחה"
  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.some((syn) => normalize(syn) === normalized)) return key;
  }
  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.some((syn) => { const n = normalize(syn); return normalized.includes(n) || n.includes(normalized); })) return key;
  }
  return "skip";
}

// ניחוש לפי תוכן העמודה (הפעלה רק כשכותרת העמודה לא זוהתה) — רשימת חוקים פשוטה כרגע.
// ניתן להרחיב בעתיד ולהחליף/לשלב עם קריאה למודל AI לזיהוי מדויק יותר של תוכן עמודות.
const CITY_NAMES = new Set(CITIES.map((c) => c.city));

export function guessFieldFromSamples(samples: string[]): string | null {
  const values = samples.map((s) => (s ?? "").trim()).filter(Boolean);
  if (values.length === 0) return null;

  const ratio = (count: number) => count / values.length;

  if (ratio(values.filter((v) => EMAIL_RE.test(v)).length) > 0.6) return "email";
  if (ratio(values.filter((v) => CITY_NAMES.has(v)).length) > 0.5) return "city";
  if (ratio(values.filter((v) => (CONTACT_STATUSES as string[]).includes(v)).length) > 0.6) return "status";
  if (ratio(values.filter((v) => (DEPARTMENTS as string[]).includes(v)).length) > 0.6) return "department";

  const phoneLike = values.filter((v) => {
    const digits = v.replace(/[^\d]/g, "");
    return digits.length >= 9 && digits.length <= 10 && digits.length / v.length > 0.8;
  });
  if (ratio(phoneLike.length) > 0.8) return "phone";

  return null;
}
