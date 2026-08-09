import Stripe from "stripe";

// server-only - אסור לייבא מקובץ "use client" (מכיל את חבילת ה-SDK עצמה, שלא
// מיועדת ל-bundle של דפדפן). עוזרי המטבע/סכום הטהורים גרים ב-lib/stripeShared.ts
export * from "./stripeShared";

// נוצר בכל קריאה (לא singleton עם state מודול) - בהשראת lib/supabase/admin.ts.
// זורק רק כשבאמת קוראים לו, כדי שקבצים שמייבאים רק את העוזרים הטהורים
// מ-stripeShared.ts לא יפוצצו על מפתח סביבה חסר
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("לא הוגדר STRIPE_SECRET_KEY");
  return new Stripe(key);
}
