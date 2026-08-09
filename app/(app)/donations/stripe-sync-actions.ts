"use server";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient, stripeCurrencyToSymbol, stripeMinorUnitsToDecimal, stripeCustomerIdOf } from "@/lib/stripe";
import { matchContactsForRows, type ParsedDonationRow } from "@/app/(app)/donations/mapping-actions";

// Stripe מגביל limit ל-100 לכל קריאת list (לא 2000 כמו נדרים פלוס) - אבל בלי
// מגבלת 20 קריאות/שעה, אז יש הרבה יותר עמודים אך פחות צורך בזהירות בין קריאות.
// עדיין חסום ל-invocation אחד קטן (ר' מגבלת Vercel Hobby - 10 שניות)
const DEFAULT_MAX_ROWS = 100;
const STRIPE_LIST_MAX = 100;

export type StripeSyncPageResult = {
  ok: boolean;
  fetched: number;
  staged: number;
  skippedDuplicates: number;
  reachedEnd: boolean;
  lastId: string | null;
  error?: string;
};

async function getCursor(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("stripe_sync_state").select("last_payment_intent_id").eq("id", true).single();
  return data?.last_payment_intent_id ?? null;
}

async function setCursor(supabase: SupabaseClient, lastId: string) {
  await supabase.from("stripe_sync_state").update({ last_payment_intent_id: lastId }).eq("id", true);
}

export async function getStripeSyncStatus(): Promise<{ lastId: string | null; updatedAt: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("stripe_sync_state").select("last_payment_intent_id, updated_at").eq("id", true).single();
  return { lastId: data?.last_payment_intent_id ?? null, updatedAt: data?.updated_at ?? null };
}

function billingDetailsOf(pi: Stripe.PaymentIntent): { name: string | null; phone: string | null } {
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return { name: charge?.billing_details?.name ?? null, phone: charge?.billing_details?.phone ?? null };
}

// בדיקה מרוכזת (query אחד) מול donation_stripe_customer_mapping_rules - מפתח
// שיוך קבוע יציב לפי מזהה לקוח Stripe, בשונה מ-donation_phone_mapping_rules
// שדורש טלפון. שימושי במיוחד לעסקאות Stripe בלי billing_details בכלל, ששם
// phone_key תמיד null ולא היה אפשר לשמור עבורן שום כלל שיוך קבוע עד כה
export async function matchStripeCustomerRules(supabase: SupabaseClient, stripeCustomerIds: string[]): Promise<Map<string, string>> {
  if (stripeCustomerIds.length === 0) return new Map();
  const { data } = await supabase
    .from("donation_stripe_customer_mapping_rules")
    .select("stripe_customer_id, contact_id")
    .in("stripe_customer_id", stripeCustomerIds);
  return new Map((data ?? []).map((r) => [r.stripe_customer_id as string, r.contact_id as string]));
}

// שולף עמוד אחד של payment intents שהצליחו מ-Stripe, עושה דה-דופ מול donations
// קיימות לפי stripe_payment_intent_id (Stripe הוא המקור הסמכותי - כפילות מדולגת
// בשקט), וכותב שורות חדשות ל-donation_import_rows עם source='Stripe'. בשונה
// מנדרים פלוס, Stripe תומך בסינון תאריך אמיתי בצד השרת (created.lte) - אין
// צורך ב-pastCutoff: אם סופק untilDate, כל התוצאות בעמוד כבר בטווח מלכתחילה
export async function fetchAndStageStripeHistoryPage(options: {
  untilDate?: string;
  maxRows?: number;
  useServiceRole?: boolean;
}): Promise<StripeSyncPageResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, fetched: 0, staged: 0, skippedDuplicates: 0, reachedEnd: false, lastId: null, error: "לא הוגדר STRIPE_SECRET_KEY" };
  }

  const supabase = options.useServiceRole ? createAdminClient() : await createClient();
  const maxRows = Math.min(options.maxRows ?? DEFAULT_MAX_ROWS, STRIPE_LIST_MAX);
  const cursor = await getCursor(supabase);

  let page: Stripe.ApiList<Stripe.PaymentIntent>;
  try {
    const stripe = getStripeClient();
    const params: Stripe.PaymentIntentListParams = { limit: maxRows, expand: ["data.latest_charge"] };
    if (cursor) params.starting_after = cursor;
    if (options.untilDate) {
      params.created = { lte: Math.floor(new Date(`${options.untilDate}T23:59:59Z`).getTime() / 1000) };
    }
    page = await stripe.paymentIntents.list(params);
  } catch (e) {
    return {
      ok: false,
      fetched: 0,
      staged: 0,
      skippedDuplicates: 0,
      reachedEnd: false,
      lastId: cursor,
      error: e instanceof Error ? e.message : "שגיאה בשליפה מ-Stripe",
    };
  }

  if (page.data.length === 0) {
    return { ok: true, fetched: 0, staged: 0, skippedDuplicates: 0, reachedEnd: true, lastId: cursor };
  }

  const succeeded = page.data.filter((pi) => pi.status === "succeeded");
  const ids = succeeded.map((pi) => pi.id);
  const { data: existing } =
    ids.length > 0 ? await supabase.from("donations").select("stripe_payment_intent_id").in("stripe_payment_intent_id", ids) : { data: [] };
  const existingIds = new Set((existing ?? []).map((d) => d.stripe_payment_intent_id as string));

  const rowsToStage: (ParsedDonationRow & { stripe_payment_intent_id: string; stripe_customer_id: string | null })[] = [];
  let skippedDuplicates = 0;

  for (const pi of succeeded) {
    if (existingIds.has(pi.id)) {
      skippedDuplicates++;
      continue;
    }
    const billing = billingDetailsOf(pi);
    rowsToStage.push({
      raw: pi as unknown as Record<string, string>,
      donor_name: billing.name,
      phone: billing.phone,
      amount: stripeMinorUnitsToDecimal(pi.amount),
      currency: stripeCurrencyToSymbol(pi.currency) ?? "₪",
      donation_date: new Date(pi.created * 1000).toISOString().slice(0, 10),
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
      stripe_payment_intent_id: pi.id,
      stripe_customer_id: stripeCustomerIdOf(pi),
    });
  }

  let staged = 0;
  if (rowsToStage.length > 0) {
    const { data: batch, error: batchError } = await supabase
      .from("donation_import_batches")
      .insert({ source: "Stripe", filename: null, created_by: null })
      .select("id")
      .single();
    if (batchError || !batch) {
      return {
        ok: false,
        fetched: page.data.length,
        staged: 0,
        skippedDuplicates,
        reachedEnd: false,
        lastId: cursor,
        error: batchError?.message ?? "שגיאה ביצירת באטש ייבוא",
      };
    }

    const phoneMatches = await matchContactsForRows(rowsToStage);
    const customerIds = Array.from(new Set(rowsToStage.map((r) => r.stripe_customer_id).filter((id): id is string => Boolean(id))));
    const customerRules = await matchStripeCustomerRules(supabase, customerIds);

    const payload = rowsToStage.map((row, i) => {
      // כלל שיוך קבוע לפי מזהה לקוח Stripe (אם קיים) גובר על ההתאמה לפי טלפון -
      // הוא ודאי (הוגדר במפורש ע"י מישהו), בעוד ההתאמה לפי טלפון היא ניחוש
      const customerRuleContactId = row.stripe_customer_id ? customerRules.get(row.stripe_customer_id) : undefined;
      const match = customerRuleContactId
        ? { phone_key: phoneMatches[i].phone_key, match_status: "matched" as const, matched_contact_id: customerRuleContactId, match_source: "permanent_rule" as const }
        : phoneMatches[i];
      return {
        batch_id: batch.id,
        raw: row.raw,
        donor_name: row.donor_name,
        phone: row.phone,
        phone_key: match.phone_key,
        amount: row.amount,
        currency: row.currency,
        donation_date: row.donation_date,
        payment_method: "כרטיס אשראי",
        record_type: "payment_only" as const,
        match_status: match.match_status,
        matched_contact_id: match.matched_contact_id,
        match_source: match.match_source,
        possible_duplicate: false,
        stripe_payment_intent_id: row.stripe_payment_intent_id,
        stripe_customer_id: row.stripe_customer_id,
        created_by: null,
      };
    });

    const { data: inserted, error: insertError } = await supabase.from("donation_import_rows").insert(payload).select("id");
    if (insertError) {
      return {
        ok: false,
        fetched: page.data.length,
        staged: 0,
        skippedDuplicates,
        reachedEnd: false,
        lastId: cursor,
        error: insertError.message,
      };
    }
    staged = inserted?.length ?? 0;
  }

  const newLastId = page.data[page.data.length - 1].id;
  await setCursor(supabase, newLastId);

  return {
    ok: true,
    fetched: page.data.length,
    staged,
    skippedDuplicates,
    reachedEnd: !page.has_more,
    lastId: newLastId,
  };
}
