"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncPledgeStatus, insertPaymentLines } from "./actions";

export type PledgeFormResult = { ok: boolean; error?: string };

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
  const contact_id = String(formData.get("contact_id") || "");
  if (!contact_id) return { ok: false, error: "יש לבחור איש קשר לפי שם או סלולארי" };

  const payload = buildPledgePayload(formData);
  if (!payload.amount || payload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const { error } = await supabase.from("pledges").insert({ contact_id, ...payload });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/donations");
  return { ok: true };
}

export async function updatePledge(
  id: string,
  _prevState: PledgeFormResult | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const supabase = await createClient();

  const payload = buildPledgePayload(formData);
  if (!payload.amount || payload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const { error } = await supabase.from("pledges").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/donations");
  return { ok: true };
}

export async function createPledgeWithPayment(
  _prevState: PledgeFormResult | null,
  formData: FormData
): Promise<PledgeFormResult> {
  const supabase = await createClient();
  const contact_id = String(formData.get("contact_id") || "");
  if (!contact_id) return { ok: false, error: "יש לבחור איש קשר לפי שם או סלולארי" };

  const pledgePayload = buildPledgePayload(formData);
  if (!pledgePayload.amount || pledgePayload.amount <= 0) return { ok: false, error: "יש להזין סכום התחייבות תקין" };

  const paymentAmount = Number(formData.get("payment_amount") || 0);
  if (!paymentAmount || paymentAmount <= 0) return { ok: false, error: "יש להזין סכום תשלום תקין" };

  const { data: pledge, error: pledgeError } = await supabase
    .from("pledges")
    .insert({ contact_id, ...pledgePayload })
    .select("id")
    .single();
  if (pledgeError || !pledge) return { ok: false, error: pledgeError?.message ?? "שגיאה ביצירת ההתחייבות" };

  const payment_method = String(formData.get("payment_method") || "מזומן");
  const payment_hub = String(formData.get("payment_hub") || "") || null;
  const payment_currency = String(formData.get("payment_currency") || "") || pledgePayload.currency;
  const cardConfirmed = formData.get("card_transaction_ok") === "1";

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
      status: payment_method === "כרטיס אשראי" ? (cardConfirmed ? "שולם" : "ממתין") : "שולם",
      source: "הזנה ידנית",
      bank_name: String(formData.get("bank_name") || "") || null,
      branch_number: String(formData.get("branch_number") || "") || null,
      account_number: String(formData.get("account_number") || "") || null,
      check_number: String(formData.get("check_number") || "") || null,
      check_date: String(formData.get("check_date") || "") || null,
    })
    .select("id")
    .single();
  if (donationError) return { ok: false, error: donationError.message };
  const linesError = await insertPaymentLines(supabase, donation.id, formData);
  if (linesError) return { ok: false, error: linesError };

  await syncPledgeStatus(supabase, pledge.id);

  revalidatePath("/donations");
  revalidatePath("/contacts");
  return { ok: true };
}
