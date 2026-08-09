// עוזרים טהורים בלבד (בלי import של חבילת "stripe" עצמה) - מותר לייבא מקבצי
// "use client" (למשל PaymentOnlyForm.tsx). ה-SDK עצמו (lib/stripe.ts) הוא
// server-only ואסור לו להיכנס ל-bundle של הלקוח

// כרטיס אשראי דרך Stripe נתמך רק במטבעות האלה - כמו isNedarimSupportedCurrency
// ב-lib/nedarim.ts, זו רשימה שמרנית ולא כל ALL_CURRENCIES (lib/types.ts) שכולל
// גם מטבעות שלא הכרחי שנתמכים/רלוונטיים לסליקת אשראי דרך Stripe עבור הארגון הזה
export const STRIPE_CURRENCY_CODES: Record<string, string> = {
  "₪": "ils",
  "$": "usd",
  "€": "eur",
  "£": "gbp",
  CHF: "chf",
};

export function isStripeSupportedCurrency(currency: string): boolean {
  return currency in STRIPE_CURRENCY_CODES;
}

// הופכי ל-STRIPE_CURRENCY_CODES - לשימוש בפענוח payment intents שמגיעים מ-Stripe
// (ייבוא היסטוריה/webhook), ששם קוד המטבע הוא ISO lowercase (למשל "ils")
export function stripeCurrencyToSymbol(code: string): string | null {
  const entry = Object.entries(STRIPE_CURRENCY_CODES).find(([, c]) => c === code.toLowerCase());
  return entry ? entry[0] : null;
}

// כל המטבעות הנתמכים כאן הם דו-ספרתיים (ils/usd/eur/gbp/chf) - אין edge-case
// של מטבע ללא-עשרוני (כמו jpy) שדורש טיפול שונה ב-Stripe (שמצפה ליחידת-מינימום,
// לא לסכום העשרוני עצמו)
export function decimalToStripeMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function stripeMinorUnitsToDecimal(amount: number): number {
  return amount / 100;
}
