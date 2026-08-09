"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { syncPledgeStatus, insertPaymentLines } from "./actions";

export type PledgeFormResult = {
  ok: boolean;
  error?: string;
  errorCode?: string;
  pledgeId?: string;
  donationId?: string;
  contactId?: string;
  followUp?: string | null;
  handler?: string | null;
  category?: string | null;
  details?: string | null;
};

function buildPledgePayload(formData: FormData) {
  return {
    category: String(formData.get("category") || "") || null,
    pledge_type: String(formData.get("pledge_type") || 'תרומה חד"פ'),
    currency: String(formData.get("currency") || "₪"),
    amount: Number(formData.get("amount") || 0),
    details: String(formData.get("details") || "") || null,
    pledge_date: String(formData.get("pledge_date") || "") || new Date().toISOString().slice(0, 10),
    payment_hub: String(formData.get("payment_hub") || "") || null,
    follow_up: String(formData.get("follow_up") || "") || null,
    handler: String(formData.get("handler") || "") || null,
  };
}

export async function createPledge(
  _prevState: PledgeFormResult | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const contact_id = String(formData.get("contact_id") || "");
  if (!contact_id) return { ok: false, error: "יש לבחור איש קשר לפי שם או סלולארי" };

  const payload = buildPledgePayload(formData);
  if (!payload.amount || payload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const { data: pledge, error } = await supabase
    .from("pledges")
    .insert({ contact_id, ...payload, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message, errorCode: error.code };

  revalidatePath("/donations");
  return {
    ok: true,
    pledgeId: pledge.id,
    contactId: contact_id,
    followUp: payload.follow_up,
    handler: payload.handler,
    category: payload.category,
    details: payload.details,
  };
}

export async function updatePledge(
  id: string,
  _prevState: PledgeFormResult | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const supabase = await createClient();

  const payload = buildPledgePayload(formData);
  if (!payload.amount || payload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const contact_id = String(formData.get("contact_id") || "") || undefined;

  const { error } = await supabase.from("pledges").update({ ...payload, ...(contact_id ? { contact_id } : {}) }).eq("id", id);
  if (error) return { ok: false, error: error.message, errorCode: error.code };

  revalidatePath("/donations");
  revalidatePath("/contacts");
  return { ok: true };
}

// עדכון קל של תאריך המשך הטיפול/המטפל בלבד על התחייבות שכבר נשמרה - נקרא מכפתור
// "תיקון" בחלונית האישור שמופיעה מיד אחרי שמירה, בלי ליצור התחייבות/תשלום כפולים
export async function updatePledgeFollowUp(
  pledgeId: string,
  followUp: string,
  handler: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("pledges").update({ follow_up: followUp, handler }).eq("id", pledgeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// עדכון רשומה מאוחדת (התחייבות+תשלום) שנוצרה יחד בזרימה 2 - מעדכן את שתי השורות
// באותה קריאה, כדי שעריכה תשקף בדיוק את מה שהוזן בטופס, בלי ליצור תשלום כפול
export async function updatePledgeWithPayment(
  pledgeId: string,
  donationId: string,
  _prevState: PledgeFormResult | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const supabase = await createClient();

  const pledgePayload = buildPledgePayload(formData);
  if (!pledgePayload.amount || pledgePayload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const paymentAmount = Number(formData.get("payment_amount") || 0);
  if (!paymentAmount || paymentAmount <= 0) return { ok: false, error: "יש להזין סכום תשלום תקין" };

  const contact_id = String(formData.get("contact_id") || "") || undefined;

  const { error: pledgeError } = await supabase
    .from("pledges")
    .update({ ...pledgePayload, ...(contact_id ? { contact_id } : {}) })
    .eq("id", pledgeId);
  if (pledgeError) return { ok: false, error: pledgeError.message, errorCode: pledgeError.code };

  const payment_method = String(formData.get("payment_method") || "מזומן");
  const payment_hub = String(formData.get("payment_hub") || "") || null;
  const payment_currency = String(formData.get("payment_currency") || "") || pledgePayload.currency;

  const { error: donationError } = await supabase
    .from("donations")
    .update({
      ...(contact_id ? { contact_id } : {}),
      amount: paymentAmount,
      currency: payment_currency,
      donation_date: String(formData.get("payment_date") || "") || pledgePayload.pledge_date,
      purpose: pledgePayload.category || "כללי",
      payment_method,
      payment_hub,
      recurrence: pledgePayload.pledge_type === "הוראת קבע" ? "חודשי" : "חד-פעמי",
      bank_name: String(formData.get("bank_name") || "") || null,
      branch_number: String(formData.get("branch_number") || "") || null,
      account_number: String(formData.get("account_number") || "") || null,
      check_number: String(formData.get("check_number") || "") || null,
      check_date: String(formData.get("check_date") || "") || null,
    })
    .eq("id", donationId);
  if (donationError) return { ok: false, error: donationError.message, errorCode: donationError.code };

  const { error: deleteLinesError } = await supabase.from("donation_payment_lines").delete().eq("donation_id", donationId);
  if (deleteLinesError) return { ok: false, error: deleteLinesError.message };
  const linesError = await insertPaymentLines(supabase, donationId, formData);
  if (linesError) return { ok: false, error: linesError };

  await syncPledgeStatus(supabase, pledgeId);

  revalidatePath("/donations");
  revalidatePath("/contacts");
  return {
    ok: true,
    pledgeId,
    followUp: pledgePayload.follow_up,
    handler: pledgePayload.handler,
    category: pledgePayload.category,
    details: pledgePayload.details,
  };
}

export async function createPledgeWithPayment(
  _prevState: PledgeFormResult | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return createPledgeWithPaymentUsingClient(supabase, user?.id ?? null, formData);
}

// גרסה שמקבלת לקוח Supabase מוזרק - נחוצה כדי שה-webhook של אישור סליקת אשראי (שאין
// לו session/cookies של משתמש מחובר) יוכל ליצור את ההתחייבות+תשלום בפועל דרך לקוח
// service-role, תוך שימוש באותה לוגיקה בדיוק כמו הזנה ידנית רגילה
export async function createPledgeWithPaymentUsingClient(
  supabase: SupabaseClient,
  userId: string | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const contact_id = String(formData.get("contact_id") || "");
  if (!contact_id) return { ok: false, error: "יש לבחור איש קשר לפי שם או סלולארי" };

  const pledgePayload = buildPledgePayload(formData);
  if (!pledgePayload.amount || pledgePayload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const paymentAmount = Number(formData.get("payment_amount") || 0);
  if (!paymentAmount || paymentAmount <= 0) return { ok: false, error: "יש להזין סכום תשלום תקין" };

  const { data: pledge, error: pledgeError } = await supabase
    .from("pledges")
    .insert({ contact_id, ...pledgePayload, created_by: userId })
    .select("id")
    .single();
  if (pledgeError || !pledge) return { ok: false, error: pledgeError?.message ?? "שגיאה ביצירת ההתחייבות" };

  const payment_method = String(formData.get("payment_method") || "מזומן");
  const payment_hub = String(formData.get("payment_hub") || "") || null;
  const payment_currency = String(formData.get("payment_currency") || "") || pledgePayload.currency;
  const cardConfirmed = formData.get("card_transaction_ok") === "1";
  const explicitStatus = String(formData.get("status") || "");

  const { data: donation, error: donationError } = await supabase
    .from("donations")
    .insert({
      contact_id,
      pledge_id: pledge.id,
      amount: paymentAmount,
      currency: payment_currency,
      donation_date: String(formData.get("payment_date") || "") || pledgePayload.pledge_date,
      purpose: pledgePayload.category || "כללי",
      payment_method,
      payment_hub,
      recurrence: pledgePayload.pledge_type === "הוראת קבע" ? "חודשי" : "חד-פעמי",
      status: explicitStatus || (payment_method === "כרטיס אשראי" ? (cardConfirmed ? "שולם" : "ממתין") : "שולם"),
      source: String(formData.get("source") || "") || "הזנה ידנית",
      bank_name: String(formData.get("bank_name") || "") || null,
      branch_number: String(formData.get("branch_number") || "") || null,
      account_number: String(formData.get("account_number") || "") || null,
      check_number: String(formData.get("check_number") || "") || null,
      check_date: String(formData.get("check_date") || "") || null,
      nedarim_transaction_id: String(formData.get("nedarim_transaction_id") || "") || null,
      stripe_payment_intent_id: String(formData.get("stripe_payment_intent_id") || "") || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (donationError) return { ok: false, error: donationError.message };
  const linesError = await insertPaymentLines(supabase, donation.id, formData);
  if (linesError) return { ok: false, error: linesError };

  await syncPledgeStatus(supabase, pledge.id);

  revalidatePath("/donations");
  revalidatePath("/contacts");
  return {
    ok: true,
    pledgeId: pledge.id,
    donationId: donation.id,
    contactId: contact_id,
    followUp: pledgePayload.follow_up,
    handler: pledgePayload.handler,
    category: pledgePayload.category,
    details: pledgePayload.details,
  };
}
