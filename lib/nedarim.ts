// אינטגרציית סליקת אשראי מול נדרים פלוס (matara.pro) באמצעות אייפרם מאובטח PCI.
// פרטי הכרטיס עצמם מוזנים ומעובדים בתוך האייפרם של נדרים פלוס בלבד - הם אף פעם
// לא מגיעים לשרת או למסד הנתונים שלנו.

export const NEDARIM_IFRAME_URL = "https://matara.pro/nedarimplus/iframe";

// נדרים פלוס תומכים בסליקת אשראי רק בשקל או דולר (לפי תיעוד ה-API)
export const NEDARIM_CURRENCY_CODES: Record<string, string> = { "₪": "1", "$": "2" };

export function isNedarimSupportedCurrency(currency: string): boolean {
  return currency in NEDARIM_CURRENCY_CODES;
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
