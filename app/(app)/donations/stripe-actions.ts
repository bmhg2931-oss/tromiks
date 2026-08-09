"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripeClient, decimalToStripeMinorUnits, isStripeSupportedCurrency, STRIPE_CURRENCY_CODES } from "@/lib/stripe";

export type StripeCheckoutKind = "payment_only" | "pledge_and_payment";

// Checkout הוא hosted redirect (לא אייפרם מוטמע כמו נדרים פלוס) - אין צורך
// ברשומת "עסקה ממתינה" משלנו: כל שדות הטופס נשמרים כ-metadata על ה-Checkout
// Session עצמו (עד 50 מפתחות, מחרוזות), ו-Stripe מחזיר אותם בשלמותם על ה-webhook
// כשהתשלום מאושר בפועל - ר' app/api/stripe-webhook/route.ts
export async function createStripeCheckoutSession(
  kind: StripeCheckoutKind,
  fields: Record<string, string>,
  amount: number,
  currency: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!isStripeSupportedCurrency(currency)) return { ok: false, error: `מטבע ${currency} אינו נתמך בסליקת Stripe` };
  if (!amount || amount <= 0) return { ok: false, error: "יש להזין סכום תשלום תקין" };
  if (!fields.contact_id) return { ok: false, error: "יש לבחור איש קשר לפני התשלום" };

  // מזהה המשתמש המחובר נשמר גם הוא כ-metadata (לא רק contact_id/amount וכו') כדי
  // ש-app/api/stripe-webhook/route.ts יוכל לשייך את ה-created_by הנכון לתרומה
  // שנוצרת מה-webhook (שאין לו session של משתמש מחובר) - מקביל ל-created_by
  // שנשמר על nedarim_pending_charges בזרימת נדרים פלוס
  const supabaseForUser = await createClient();
  const {
    data: { user },
  } = await supabaseForUser.auth.getUser();

  // אותו משתנה שכבר משמש לבניית קישורים במיילים (task-reminders) - ר' .env.local.example
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: STRIPE_CURRENCY_CODES[currency],
            unit_amount: decimalToStripeMinorUnits(amount),
            product_data: { name: kind === "pledge_and_payment" ? "תשלום עבור התחייבות" : "תרומה" },
          },
          quantity: 1,
        },
      ],
      metadata: { kind, created_by: user?.id ?? "", ...fields },
      client_reference_id: fields.contact_id,
      success_url: `${origin}/donations?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/donations`,
    });
    if (!session.url) return { ok: false, error: "לא התקבלה כתובת תשלום מ-Stripe" };
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה ביצירת עסקת Stripe" };
  }
}

export type StripeCheckoutStatus =
  | { status: "pending" }
  | { status: "confirmed"; donationId?: string; pledgeId?: string; contactId?: string }
  | { status: "failed"; error: string }
  | { status: "not_found" };

// נקרא בפולינג מהלקוח אחרי שהדפדפן חוזר מ-Stripe (success_url) - מקביל ל-
// getNedarimChargeStatus, אבל בודק גם מול Stripe עצמו (session.payment_status)
// וגם מול donations.stripe_payment_intent_id, כי ה-webhook (שיוצר את התרומה
// בפועל) עשוי עדיין לא להספיק לרוץ ברגע שהדפדפן חוזר
export async function getStripeCheckoutStatus(sessionId: string): Promise<StripeCheckoutStatus> {
  const stripe = getStripeClient();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return { status: "not_found" };
  }

  if (session.status === "expired") return { status: "failed", error: "פג תוקף התשלום, יש לנסות שוב" };
  if (session.payment_status === "unpaid") return { status: "pending" };

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return { status: "pending" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("donations")
    .select("id, pledge_id, contact_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (!data) return { status: "pending" }; // אושר ב-Stripe, אבל ה-webhook עדיין לא עיבד
  return { status: "confirmed", donationId: data.id, pledgeId: data.pledge_id ?? undefined, contactId: data.contact_id ?? undefined };
}
