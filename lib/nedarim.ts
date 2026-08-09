// אינטגרציית סליקת אשראי מול נדרים פלוס (matara.pro) באמצעות אייפרם מאובטח PCI.
// פרטי הכרטיס עצמם מוזנים ומעובדים בתוך האייפרם של נדרים פלוס בלבד - הם אף פעם
// לא מגיעים לשרת או למסד הנתונים שלנו.

export const NEDARIM_IFRAME_URL = "https://www.matara.pro/nedarimplus/iframe/";

// נדרים פלוס תומכים בסליקת אשראי רק בשקל או דולר (לפי תיעוד ה-API)
export const NEDARIM_CURRENCY_CODES: Record<string, string> = { "₪": "1", "$": "2" };

export function isNedarimSupportedCurrency(currency: string): boolean {
  return currency in NEDARIM_CURRENCY_CODES;
}

// נדרים פלוס הוא סולק ישראלי - סליקת אשראי דרכו נתמכת רק במוקד תשלום "ישראל"
export const NEDARIM_SUPPORTED_HUB = "ישראל";

// כתובות ה-IP שמהן נדרים פלוס שולחים עדכוני CallBack - לפי התיעוד הרשמי. יש לוודא
// שבקשת webhook נכנסת מגיעה מאחת מהן לפני שסומכים עליה כאישור תשלום אמיתי
export const NEDARIM_CALLBACK_IPS = ["18.194.219.73", "3.70.117.239", "3.74.120.185", "18.196.146.117"];

// אושר מול התיעוד הרשמי (NedarimPlus-API.md, שהועלה מאוחר יותר): ה-Status ב-
// TransactionResponse/CallBack הוא בינארי - "OK" (הצלחה) | "Error" (שגיאה) בלבד,
// בכל מבני התשובה המתועדים (ביצוע עסקה מהדף, הקמת עסקה בצד שרת, ה-webhook הכללי).
// ה-match כאן נשאר התאמה מדויקת (לא prefix) ומרחיב מעבר ל-OK/Error בכוונה
// (true/1/אישור/בוצע/success) - לא לצמצם בלי לוודא שאף אחד לא כבר תלוי בערכים
// האלה בפועל; ההתאמה המדויקת כבר מונעת את הבאג המקורי ("100" בטעות כהצלחה)
export function isNedarimSuccessStatus(status: string): boolean {
  return /^(ok|true|1|אישור|בוצע|success)$/i.test(status.trim());
}

export type NedarimTransactionResult = {
  Status: string;
  Message?: string;
  [key: string]: unknown;
};

export type NedarimChargeFields = {
  FirstName: string;
  LastName: string;
  Street?: string;
  City?: string;
  Phone?: string;
  Mail?: string;
  Amount: string;
  Currency: string;
  Groupe?: string;
  Comment?: string;
};

// --- ייבוא היסטורי + סנכרון שוטף (GetHistoryJson) ---

// שולף היסטוריית עסקאות עמוד-עמוד (LastId/MaxId, מוגבל ל-20 קריאות בשעה, עד 2000
// שורות לקריאה לפי התיעוד) - אין endpoint עם פילטר טווח תאריכים אמיתי, ר' התכנון
export const NEDARIM_HISTORY_URL = "https://matara.pro/nedarimplus/Reports/Manage3.aspx";

// שדות GetHistoryJson הרלוונטיים לנו (התיעוד מחזיר עוד כמה, לא כולם רלוונטיים לייבוא)
export type NedarimHistoryTransaction = {
  TransactionId: string;
  ClientName?: string;
  Phone?: string;
  Amount: string;
  Currency: string;
  TransactionTime: string;
  Groupe?: string;
  Comments?: string;
  [key: string]: unknown;
};

// הופך קוד מטבע של נדרים פלוס (כפי שמופיע ב-Currency בתגובת GetHistoryJson) לסימן
// המטבע של המערכת - ההופכי ל-NEDARIM_CURRENCY_CODES
export function nedarimCurrencyToSymbol(code: string): string | null {
  const entry = Object.entries(NEDARIM_CURRENCY_CODES).find(([, c]) => c === code);
  return entry ? entry[0] : null;
}

// מפענח תאריך שמוחזר מ-GetHistoryJson. התיעוד לא מציין את הפורמט המדויק של
// TransactionTime בתשובה (בשונה משדות From/To בבקשה, ששם dd/mm/yyyy מתועד
// במפורש) - לכן ליתר ביטחון תומך גם ב-dd/mm/yyyy (עם או בלי שעה) וגם ב-ISO,
// ומחזיר null (ולא ניחוש שגוי) כשהפורמט לא מזוהה בבירור
export function parseNedarimHistoryDate(v: string | undefined | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}
