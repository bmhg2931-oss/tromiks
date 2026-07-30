"use server";

import { createClient } from "@/lib/supabase/server";

export type NedarimPendingFlow = "payment_only" | "pledge_and_payment";

export type NedarimChargeStatus =
  | { status: "pending" }
  | {
      status: "confirmed";
      donationId?: string;
      pledgeId?: string;
      contactId?: string;
      followUp?: string | null;
      handler?: string | null;
      category?: string | null;
      details?: string | null;
      surplus?: number;
      surplusCurrency?: string;
    }
  | { status: "failed"; error: string }
  | { status: "not_found" };

// יוצר רשומת "עסקת אשראי ממתינה" לפני פתיחת האייפרם - כל שדות הטופס נשמרים כ-JSON
// (payload) כדי שברגע שמתקבל אישור אמיתי מהשרת של נדרים פלוס (CallBack, לא תגובת
// הצד-לקוח הניתנת לזיוף) נוכל ליצור את רשומת התרומה/ההתחייבות בפועל בלי לסמוך על הדפדפן
export async function createPendingNedarimCharge(
  refId: string,
  flow: NedarimPendingFlow,
  fields: Record<string, string>,
  expectedAmount: number,
  expectedCurrency: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("nedarim_pending_charges").insert({
    id: refId,
    flow,
    payload: fields,
    expected_amount: expectedAmount,
    expected_currency: expectedCurrency,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// נקרא בפולינג מהלקוח אחרי שהאייפרם דיווח על הצלחה - ממתין לאישור השרתי האמיתי
// (שמגיע מה-webhook) לפני שהתשלום נחשב סופי
export async function getNedarimChargeStatus(refId: string): Promise<NedarimChargeStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nedarim_pending_charges")
    .select("status, error_message, result_donation_id, result_pledge_id, result_surplus, result_surplus_currency, payload")
    .eq("id", refId)
    .maybeSingle();
  if (error || !data) return { status: "not_found" };
  if (data.status === "pending") return { status: "pending" };
  if (data.status === "failed") return { status: "failed", error: data.error_message || "העסקה נכשלה" };

  const payload = (data.payload ?? {}) as Record<string, string>;
  return {
    status: "confirmed",
    donationId: data.result_donation_id ?? undefined,
    pledgeId: data.result_pledge_id ?? undefined,
    contactId: payload.contact_id,
    followUp: payload.follow_up ?? null,
    handler: payload.handler ?? null,
    category: payload.category ?? payload.purpose ?? null,
    details: payload.details ?? null,
    surplus: data.result_surplus ?? undefined,
    surplusCurrency: data.result_surplus_currency ?? undefined,
  };
}
