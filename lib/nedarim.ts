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

// התיעוד הרשמי של נדרים פלוס (matara.pro) עבר לפורטל ניהול הדורש התחברות, ולא הצלחתי
// לאתר בציבור את רשימת ה-Status המדויקת שהם שולחים ב-CallBack (חיפוש ופניה לפורומים
// הרלוונטיים נחסמו). לכן, ליתר ביטחון, הבדיקה כאן היא התאמה מדויקת (עוגן גם בסוף המחרוזת)
// ולא רק prefix - כדי ש"1" לא יתאים בטעות גם לקוד שגיאה כמו "100". אם בפועל נדרים פלוס
// שולחים ערך מורכב (למשל "OK - אושר") שאמור להיחשב הצלחה ואינו תואם כאן, יש להרחיב את
// הרשימה בהתאם למה שנצפה בפועל בלוגים של ה-webhook, ולא לחזור ל-prefix matching
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
