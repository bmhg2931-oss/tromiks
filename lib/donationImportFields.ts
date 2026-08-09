import { ALL_CURRENCIES, PAY_METHODS } from "./types";

export type ImportFieldOption = { key: string; label: string };

// 6 ספרות אחרונות מנורמלות (digits-only) - suffix ולא prefix, כדי לתמוך בפורמטים
// בינלאומיים שונים (קידומת מדינה, אפס מוביל וכו') בלי להיכשל על הבדלי פורמט
export function phoneKey(phone: string): string {
  return phone.replace(/[^\d]/g, "").slice(-6);
}

// "skip" תמיד ראשון ברשימה, בדיוק כמו ב-lib/contactImportFields.ts, כדי שעמודה
// לא-מזוהה תוצג כברירת מחדל "אל תייבא" ולא תמופה בטעות לשדה שגוי
export const DONATION_IMPORT_FIELD_OPTIONS: ImportFieldOption[] = [
  { key: "skip", label: "— אל תייבא —" },
  { key: "donation_date", label: "תאריך" },
  { key: "amount", label: "סכום" },
  { key: "donor_name", label: "שם תורם" },
  { key: "phone", label: "טלפון" },
  { key: "payment_method_raw", label: "אמצעי תשלום" },
  { key: "currency", label: "מטבע" },
  { key: "category", label: "קטגוריה" },
  { key: "payment_hub", label: "מוקד תשלום" },
  { key: "pledge_type", label: "סוג התחייבות" },
  { key: "handler", label: "מטפל" },
  { key: "status", label: "סטטוס" },
  { key: "bank_name", label: "בנק" },
  { key: "branch_number", label: "סניף" },
  { key: "account_number", label: "מספר חשבון" },
  { key: "check_number", label: "מספר שיק" },
  { key: "check_date", label: "תאריך שיק" },
  { key: "notes", label: "הערה" },
];

const HEADER_SYNONYMS: Record<string, string[]> = {
  donation_date: ["תאריך", "תאריך תרומה", "תאריך תשלום", "date"],
  amount: ["סכום", "סכום תרומה", "amount", "sum"],
  donor_name: ["שם תורם", "שם", "שם מלא", "תורם", "donor", "name", "full name"],
  phone: ["טלפון", "נייד", "סלולארי", "טלפון נייד", "מספר טלפון", "phone", "mobile", "cell"],
  payment_method_raw: ["אמצעי תשלום", "אופן תשלום", "payment method", "payment"],
  currency: ["מטבע", "currency"],
  category: ["קטגוריה", "קמפיין", "ייעוד", "category", "campaign", "fund"],
  payment_hub: ["מוקד תשלום", "מוקד", "payment hub", "hub"],
  pledge_type: ["סוג התחייבות", "סוג", "pledge type"],
  handler: ["מטפל", "אחראי", "handler"],
  status: ["סטטוס", "status"],
  bank_name: ["בנק", "שם בנק", "bank"],
  branch_number: ["סניף", "מספר סניף", "branch"],
  account_number: ["מספר חשבון", "חשבון", "account", "account number"],
  check_number: ["מספר שיק", "מספר המחאה", "שיק מספר", "check number"],
  check_date: ["תאריך שיק", "תאריך המחאה", "check date"],
  notes: ["הערה", "הערות", "notes", "comment"],
};

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/["'׳’.]/g, "");
}

// זהה בצורתו ל-guessFieldForHeader ב-lib/contactImportFields.ts: התאמה מדויקת קודמת
// להתאמה חלקית, כדי שכותרת רחבה לא "תבלע" כותרת ספציפית יותר
export function guessFieldForHeader(header: string): string {
  const normalized = normalize(header);
  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.some((syn) => normalize(syn) === normalized)) return key;
  }
  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.some((syn) => { const n = normalize(syn); return normalized.includes(n) || n.includes(normalized); })) return key;
  }
  return "skip";
}

// ניחוש לפי תוכן העמודה (מופעל רק כשכותרת העמודה לא זוהתה) - אותה גישה כמו
// guessFieldFromSamples הקיים לאנשי קשר
export function guessFieldFromSamples(samples: string[]): string | null {
  const values = samples.map((s) => (s ?? "").trim()).filter(Boolean);
  if (values.length === 0) return null;

  const ratio = (count: number) => count / values.length;

  const currencyLike = values.filter((v) => (ALL_CURRENCIES as string[]).includes(v));
  if (ratio(currencyLike.length) > 0.6) return "currency";

  // בדיקת טלפון קודמת לבדיקת סכום בכוונה: מספר טלפון בן 9-10 ספרות (כמו "0501234567")
  // הוא גם ולידי כ"סכום" לפי הרג'קס הפשוט למטה - צריך להכריע לטובת טלפון קודם, כי
  // סכום תרומה אמיתי כמעט לעולם לא יהיה רצף של 9+ ספרות בלי נקודה עשרונית/פסיקים
  const phoneLike = values.filter((v) => {
    const digits = v.replace(/[^\d]/g, "");
    return digits.length >= 9 && digits.length <= 15 && digits.length / v.length > 0.7;
  });
  if (ratio(phoneLike.length) > 0.8) return "phone";

  const amountLike = values.filter((v) => /^-?[\d,]+(\.\d+)?$/.test(v.replace(/[₪$€£]/g, "").trim()));
  if (ratio(amountLike.length) > 0.8) return "amount";

  const dateLike = values.filter((v) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (ratio(dateLike.length) > 0.8) return "donation_date";

  return null;
}

// וריאציות נפוצות של אמצעי תשלום כפי שהן מופיעות בקבצים חיצוניים (ייצוא בנקאי וכו') -
// כל אחת ממופה לערך המדויק מ-PAY_METHODS (lib/types.ts) שמוצג ב-<select> של המערכת.
// שיטת ההתאמה (exact ואז substring) זהה ל-matchBankName ב-donations/check-scan-actions.ts
const PAYMENT_METHOD_SYNONYMS: Record<string, string[]> = {
  "מזומן": ["מזומן", "מזומנים", "cash"],
  "צ'ק": ["צ'ק", "צ׳ק", "המחאה", "המחאות", "שיק", "check", "cheque"],
  "כרטיס אשראי": ["כרטיס אשראי", "אשראי", "ויזה", "מאסטרקארד", "credit", "credit card", "visa", "mastercard"],
  "העברה בנקאית": ["העברה בנקאית", "העברה", "העברה בנק", "bank transfer", "transfer", "wire"],
  "הוראת קבע": ["הוראת קבע", "הו\"ק", "standing order"],
  "ביט": ["ביט", "bit"],
};

// מנסה למצוא את הערך המדויק מ-PAY_METHODS - מחזיר null אם אין התאמה סבירה (ואז
// matchPaymentMethod ב-mapping-actions.ts יפנה ל-AI כ-fallback עבור הערך הזה)
export function matchPaymentMethodSynonym(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const g = raw.trim();
  if (!g) return null;
  const normalized = normalize(g);
  for (const method of PAY_METHODS) {
    const synonyms = PAYMENT_METHOD_SYNONYMS[method] ?? [method];
    if (synonyms.some((syn) => normalize(syn) === normalized)) return method;
  }
  for (const method of PAY_METHODS) {
    const synonyms = PAYMENT_METHOD_SYNONYMS[method] ?? [method];
    if (synonyms.some((syn) => { const n = normalize(syn); return normalized.includes(n) || n.includes(normalized); })) return method;
  }
  return null;
}
