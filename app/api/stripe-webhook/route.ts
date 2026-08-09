import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDonationWithClient } from "@/app/(app)/donations/actions";
import { createPledgeWithPaymentUsingClient } from "@/app/(app)/donations/pledge-actions";
import { matchContactsForRows, type ParsedDonationRow } from "@/app/(app)/donations/mapping-actions";
import { getStripeClient, stripeCurrencyToSymbol, stripeMinorUnitsToDecimal } from "@/lib/stripe";
import type { StripeCheckoutKind } from "@/app/(app)/donations/stripe-actions";

// חובה: זהו webhook חיצוני שנקרא בזמן ריצה בלבד ע"י שרתי Stripe - אסור ש-Next.js
// ינסה "לקפוא" (prerender) אותו בזמן build
export const dynamic = "force-dynamic";

// שולף שם/טלפון מהעסקה כשאפשר, לצורך שיוך אוטומטי בזרימה ב' (staging) - לא חוסם:
// אם זה נכשל, השורה עדיין נשמרת עם donor_name/phone ריקים ופשוט תסומן "טרם שויך",
// בדיוק כמו כל שורה אחרת בלי התאמת טלפון
async function tryGetBillingDetails(paymentIntent: Stripe.PaymentIntent): Promise<{ name: string | null; phone: string | null }> {
  const chargeId =
    typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id;
  if (!chargeId) return { name: null, phone: null };
  try {
    const charge = await getStripeClient().charges.retrieve(chargeId);
    return { name: charge.billing_details?.name ?? null, phone: charge.billing_details?.phone ?? null };
  } catch {
    return { name: null, phone: null };
  }
}

// זרימה א': תשלום שנוצר דרך createStripeCheckoutSession שלנו (יש metadata.kind) -
// יוצר תרומה/התחייבות+תשלום בפועל, בדיוק כמו app/api/nedarim-callback/route.ts
// עושה מ-nedarim_pending_charges.payload. אידמפוטנטי: אם כבר קיימת donations
// עם ה-payment_intent_id הזה (webhook נשלח פעמיים), לא עושים שום דבר
async function handleCheckoutCompleted(supabase: ReturnType<typeof createAdminClient>, session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const kind = metadata.kind as StripeCheckoutKind | undefined;
  if (!kind) return; // Checkout Session שלא נוצרה על ידינו - שום פעולה

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return;

  const { data: existing } = await supabase.from("donations").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (existing) return; // כבר טופל בעבר - webhook כפול

  const fd = new FormData();
  Object.entries(metadata).forEach(([key, value]) => {
    if (key !== "kind" && key !== "created_by") fd.set(key, String(value));
  });
  fd.set("card_transaction_ok", "1");
  fd.set("stripe_payment_intent_id", paymentIntentId);

  const createdBy = metadata.created_by || null;
  if (kind === "payment_only") {
    await createDonationWithClient(supabase, createdBy, fd);
  } else {
    await createPledgeWithPaymentUsingClient(supabase, createdBy, fd);
  }
}

// זרימה ב': PaymentIntent שהצליח ולא הגיע מ-Checkout שלנו (פעילות אחרת בחשבון
// ה-Stripe החי של הארגון) - נכתב ל-donation_import_rows לשיוך ידני, בדיוק כמו
// שנדרים פלוס עושה ב-app/(app)/donations/nedarim-sync-actions.ts. דה-דופ כפול:
// גם מול donations (אולי כבר טופל ע"י זרימה א'), וגם מול donation_import_rows
// (webhook עשוי להישלח יותר מפעם אחת לפני שהשורה משויכת/מאושרת)
async function handlePaymentIntentSucceeded(supabase: ReturnType<typeof createAdminClient>, paymentIntent: Stripe.PaymentIntent) {
  const { data: existingDonation } = await supabase
    .from("donations")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();
  if (existingDonation) return;

  const { data: existingRow } = await supabase
    .from("donation_import_rows")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();
  if (existingRow) return;

  const billing = await tryGetBillingDetails(paymentIntent);
  const row: ParsedDonationRow = {
    raw: paymentIntent as unknown as Record<string, string>,
    donor_name: billing.name,
    phone: billing.phone,
    amount: stripeMinorUnitsToDecimal(paymentIntent.amount),
    currency: stripeCurrencyToSymbol(paymentIntent.currency) ?? "₪",
    donation_date: new Date(paymentIntent.created * 1000).toISOString().slice(0, 10),
    payment_method_raw: null,
    record_type: "payment_only",
    category: null,
    payment_hub: null,
    pledge_type: null,
    handler: null,
    status: null,
    bank_name: null,
    branch_number: null,
    account_number: null,
    check_number: null,
    check_date: null,
    notes: null,
  };

  const { data: batch, error: batchError } = await supabase
    .from("donation_import_batches")
    .insert({ source: "Stripe", filename: null, created_by: null })
    .select("id")
    .single();
  if (batchError || !batch) return;

  const [match] = await matchContactsForRows([row]);
  await supabase.from("donation_import_rows").insert({
    batch_id: batch.id,
    raw: row.raw,
    donor_name: row.donor_name,
    phone: row.phone,
    phone_key: match.phone_key,
    amount: row.amount,
    currency: row.currency,
    donation_date: row.donation_date,
    payment_method: "כרטיס אשראי",
    record_type: "payment_only",
    match_status: match.match_status,
    matched_contact_id: match.matched_contact_id,
    match_source: match.match_source,
    possible_duplicate: false,
    stripe_payment_intent_id: paymentIntent.id,
    created_by: null,
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ ok: false, error: "חסר אימות webhook" }, { status: 401 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ ok: false, error: "חתימה לא תקינה" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
  } else if (event.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(supabase, event.data.object as Stripe.PaymentIntent);
  }

  return NextResponse.json({ ok: true });
}
