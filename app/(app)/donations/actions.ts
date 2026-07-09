"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentExchangeRate } from "@/lib/exchangeRate";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DonationFormResult = {
  ok: boolean;
  error?: string;
  donationId?: string;
  surplus?: number;
  surplusCurrency?: string;
};

// לאחר שמירת תשלום, בודק אם הוא דחף את היתרה הכוללת של איש הקשר (בכל המטבעות, לפי שער
// יציג נוכחי) למינוס - כלומר נוצר עודף/זיכוי. מחזיר את סכום העודף במטבע התשלום עצמו
// (מוגבל לסכום התשלום), כדי שאפשר יהיה להציע ליצור התחייבות "בונוס" תואמת באותו מטבע.
async function computeSurplus(
  supabase: SupabaseClient,
  contactId: string,
  paymentAmount: number,
  paymentCurrency: string
): Promise<{ surplus?: number; surplusCurrency?: string }> {
  const [{ data: pledges }, { data: donations }] = await Promise.all([
    supabase.from("pledges").select("amount, currency").eq("contact_id", contactId).neq("status", "בוטל"),
    supabase.from("donations").select("amount, currency").eq("contact_id", contactId),
  ]);

  const netByCurrency = new Map<string, number>();
  for (const p of pledges ?? []) {
    netByCurrency.set(p.currency, (netByCurrency.get(p.currency) || 0) + Number(p.amount));
  }
  for (const d of donations ?? []) {
    netByCurrency.set(d.currency, (netByCurrency.get(d.currency) || 0) - Number(d.amount));
  }

  const currencies = Array.from(netByCurrency.keys());
  const rates = new Map<string, number>();
  await Promise.all(
    currencies
      .filter((cur) => cur !== "₪")
      .map(async (cur) => {
        const result = await getCurrentExchangeRate(cur);
        if (result.ok && result.rate) rates.set(cur, result.rate);
      })
  );

  let totalILS = 0;
  for (const [cur, net] of netByCurrency.entries()) {
    totalILS += cur === "₪" ? net : net * (rates.get(cur) ?? 0);
  }

  if (totalILS >= -0.5) return {};

  const creditILS = Math.abs(totalILS);
  const rate = paymentCurrency === "₪" ? 1 : rates.get(paymentCurrency);
  if (!rate) return {};
  const surplusInPaymentCurrency = Math.min(creditILS / rate, paymentAmount);
  if (surplusInPaymentCurrency <= 0.5) return {};
  return { surplus: surplusInPaymentCurrency, surplusCurrency: paymentCurrency };
}

export async function syncPledgeStatus(supabase: SupabaseClient, pledgeId: string) {
  const { data: pledge } = await supabase.from("pledges").select("amount, status").eq("id", pledgeId).single();
  if (!pledge || pledge.status === "בוטל") return;
  const { data: paidRows } = await supabase.from("donations").select("amount").eq("pledge_id", pledgeId);
  const paid = (paidRows ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const status = paid >= Number(pledge.amount) - 0.009 ? "שולם" : paid > 0 ? "שולם חלקית" : "פתוח";
  await supabase.from("pledges").update({ status }).eq("id", pledgeId);
}

export async function insertPaymentLines(supabase: SupabaseClient, donationId: string, formData: FormData): Promise<string | null> {
  const paymentLinesRaw = String(formData.get("payment_lines") || "");
  if (!paymentLinesRaw) return null;
  try {
    const lines: { amount: number; bankName: string; branchNumber: string; accountNumber: string; checkNumber: string; checkDate: string }[] =
      JSON.parse(paymentLinesRaw);
    const rows = lines
      .filter((l) => l.amount > 0)
      .map((l) => ({
        donation_id: donationId,
        amount: l.amount,
        bank_name: l.bankName || null,
        branch_number: l.branchNumber || null,
        account_number: l.accountNumber || null,
        check_number: l.checkNumber || null,
        check_date: l.checkDate || null,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from("donation_payment_lines").insert(rows);
      if (error) return error.message;
    }
  } catch {
    // התעלמות משגיאת פענוח - התשלום הראשי כבר נשמר בהצלחה
  }
  return null;
}

// כל תשלום הוא רשומה עצמאית ללא שיוך להתחייבות ספציפית: היתרה הפתוחה של איש הקשר
// מחושבת כאגרגט (סך כל ההתחייבויות פחות סך כל התשלומים), ולא לפי פיצול פרטני בין
// תשלום להתחייבות מסוימת.
export async function createDonation(
  _prevState: DonationFormResult | null,
  formData: FormData
): Promise<DonationFormResult> {
  const supabase = await createClient();
  const contact_id = String(formData.get("contact_id") || "");
  if (!contact_id) return { ok: false, error: "יש לבחור איש קשר לפי שם או סלולארי" };

  const amount = Number(formData.get("amount") || 0);
  if (!amount || amount <= 0) return { ok: false, error: "יש להזין סכום תשלום תקין" };

  const purpose = String(formData.get("purpose") || "").trim() || "תשלום כללי";
  const payment_method = String(formData.get("payment_method") || "מזומן");
  const payment_hub = String(formData.get("payment_hub") || "") || null;
  const currency = String(formData.get("currency") || "₪");
  const donation_date = String(formData.get("donation_date") || "") || new Date().toISOString().slice(0, 10);
  const cardConfirmed = formData.get("card_transaction_ok") === "1";

  const basePayload = {
    contact_id,
    currency,
    donation_date,
    payment_method,
    payment_hub,
    recurrence: payment_method === "הוראת קבע" ? "חודשי" : "חד-פעמי",
    status: payment_method === "כרטיס אשראי" ? (cardConfirmed ? "שולם" : "ממתין") : "שולם",
    source: "הזנה ידנית",
    notes: String(formData.get("notes") || "") || null,
    follow_up: String(formData.get("follow_up") || "") || null,
    follow_up_details: String(formData.get("follow_up_details") || "") || null,
    bank_name: String(formData.get("bank_name") || "") || null,
    branch_number: String(formData.get("branch_number") || "") || null,
    account_number: String(formData.get("account_number") || "") || null,
    check_number: String(formData.get("check_number") || "") || null,
    check_date: String(formData.get("check_date") || "") || null,
  };

  const { data: donation, error } = await supabase
    .from("donations")
    .insert({ ...basePayload, pledge_id: null, amount, purpose })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const linesError = await insertPaymentLines(supabase, donation.id, formData);
  if (linesError) return { ok: false, error: linesError };

  revalidatePath("/donations");
  revalidatePath("/contacts");

  const { surplus, surplusCurrency } = await computeSurplus(supabase, contact_id, amount, currency);
  return { ok: true, donationId: donation.id, surplus, surplusCurrency };
}

// נקרא אחרי ששולם תשלום שיוצר עודף/זיכוי, כשהמשתמש בוחר לסמן את העודף כהתחייבות
// "בונוס". יוצר התחייבות חדשה לסכום העודף, ומשייך אליה את התשלום שכבר נשמר (pledge_id) -
// כך שברשימת התרומות זה יוצג כרשומה מאוחדת אחת "התחייבות ותשלום", בדיוק כמו בזרימה 2.
// אין כאן יצירת תשלום כפול - התשלום הקיים עצמו הוא שמקבל את השיוך.
export async function markSurplusAsBonusPledge(
  contactId: string,
  donationId: string,
  amount: number,
  currency: string,
  category: string,
  date: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: pledge, error: pledgeError } = await supabase
    .from("pledges")
    .insert({
      contact_id: contactId,
      category: category || "תשלום כללי",
      pledge_type: 'תרומה חד"פ',
      currency,
      amount,
      pledge_date: date,
      status: "שולם",
    })
    .select("id")
    .single();
  if (pledgeError) return { ok: false, error: pledgeError.message };

  const { data: existingDonation } = await supabase.from("donations").select("notes").eq("id", donationId).single();
  const newNotes = existingDonation?.notes ? `${existingDonation.notes}, תרומת בונוס` : "תרומת בונוס";

  const { error: linkError } = await supabase
    .from("donations")
    .update({ pledge_id: pledge.id, notes: newNotes })
    .eq("id", donationId);
  if (linkError) return { ok: false, error: linkError.message };

  revalidatePath("/donations");
  revalidatePath("/contacts");
  return { ok: true };
}

export async function updateDonation(
  id: string,
  _prevState: DonationFormResult | null,
  formData: FormData
): Promise<DonationFormResult> {
  const supabase = await createClient();

  const amount = Number(formData.get("amount") || 0);
  if (!amount || amount <= 0) return { ok: false, error: "יש להזין סכום תשלום תקין" };

  const purpose = String(formData.get("purpose") || "").trim() || "תשלום כללי";
  const payment_method = String(formData.get("payment_method") || "מזומן");
  const currency = String(formData.get("currency") || "₪");
  const donation_date = String(formData.get("donation_date") || "") || new Date().toISOString().slice(0, 10);

  // pledge_id אינו נערך כאן בכוונה: השיוך (אם קיים, מזרימת התחייבות+תשלום) הוא לצורך
  // תיוג/תצוגה בלבד ולא נגזר מטופס העריכה. הסכום ממשיך להיספר במלואו לסך כל התשלומים
  // האגרגטיבי בכל מקרה.
  const { data: donation, error } = await supabase
    .from("donations")
    .update({
      amount,
      currency,
      donation_date,
      purpose,
      payment_method,
      recurrence: payment_method === "הוראת קבע" ? "חודשי" : "חד-פעמי",
      status: payment_method === "כרטיס אשראי" ? "ממתין" : "שולם",
      notes: String(formData.get("notes") || "") || null,
      follow_up: String(formData.get("follow_up") || "") || null,
      follow_up_details: String(formData.get("follow_up_details") || "") || null,
      bank_name: String(formData.get("bank_name") || "") || null,
      branch_number: String(formData.get("branch_number") || "") || null,
      account_number: String(formData.get("account_number") || "") || null,
      check_number: String(formData.get("check_number") || "") || null,
      check_date: String(formData.get("check_date") || "") || null,
    })
    .eq("id", id)
    .select("pledge_id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (donation?.pledge_id) await syncPledgeStatus(supabase, donation.pledge_id);

  revalidatePath("/donations");
  revalidatePath("/contacts");
  return { ok: true };
}
