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

export function isNedarimSuccessStatus(status: string): boolean {
  return /^(ok|true|1|אישור|בוצע|success)/i.test(status);
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
