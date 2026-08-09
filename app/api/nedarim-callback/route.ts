import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDonationWithClient } from "@/app/(app)/donations/actions";
import { createPledgeWithPaymentUsingClient } from "@/app/(app)/donations/pledge-actions";
import { NEDARIM_CALLBACK_IPS, isNedarimSuccessStatus } from "@/lib/nedarim";

// חובה: זהו webhook חיצוני שנקרא בזמן ריצה בלבד ע"י שרתי נדרים פלוס - אסור ש-Next.js
// ינסה "לקפוא" (prerender) אותו בזמן build
export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0]?.trim() || null;
}

// מקבל את עדכון ה-CallBack שנשלח מנדרים פלוס בסיום עסקת אשראי (ראה FinishTransaction2
// ב-components/NedarimIframe.tsx, ששולח את הכתובת הזו בפרמטר CallBack). לפי תיעוד ה-API:
// "אין לבסס את ההחלטה 'התשלום בוצע' על תגובת צד הלקוח בלבד... המקור האמין היחיד הוא
// העדכון שמגיע לשרת שלכם" - לכן רשומת התרומה/ההתחייבות בפועל נוצרת רק כאן, ולא מהדפדפן
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!ip || !NEDARIM_CALLBACK_IPS.includes(ip)) {
    return NextResponse.json({ ok: false, error: "מקור לא מזוהה" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const refId = String(body.Param1 || body.Param2 || "");
  if (!refId) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();
  const { data: charge } = await supabase
    .from("nedarim_pending_charges")
    .select("*")
    .eq("id", refId)
    .maybeSingle();

  // רשומה לא מוכרת, או שכבר טופלה בעבר (נדרים לא אמורים לשלוח פעמיים, אך למקרה של
  // ניסיון חוזר עדיף להתעלם באופן אידמפוטנטי מאשר ליצור רשומה כפולה)
  if (!charge || charge.status !== "pending") {
    return NextResponse.json({ ok: true });
  }

  if (body.Amount !== undefined && body.Amount !== null) {
    const receivedAmount = Number(body.Amount);
    if (!Number.isNaN(receivedAmount) && Math.abs(receivedAmount - Number(charge.expected_amount)) > 0.5) {
      await supabase
        .from("nedarim_pending_charges")
        .update({ status: "failed", error_message: "אי-התאמה בסכום העסקה", confirmed_at: new Date().toISOString() })
        .eq("id", refId);
      return NextResponse.json({ ok: true });
    }
  }

  if (!isNedarimSuccessStatus(String(body.Status ?? ""))) {
    await supabase
      .from("nedarim_pending_charges")
      .update({
        status: "failed",
        error_message: String(body.Message || "העסקה נכשלה"),
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", refId);
    return NextResponse.json({ ok: true });
  }

  const payload = (charge.payload ?? {}) as Record<string, string>;
  const fd = new FormData();
  Object.entries(payload).forEach(([key, value]) => fd.set(key, value));
  fd.set("card_transaction_ok", "1");
  // חייב להיכתב גם על donations.nedarim_transaction_id עצמו (לא רק על
  // nedarim_pending_charges למטה) - אחרת סנכרון היסטורי עתידי (ר'
  // nedarim-sync-actions.ts) לא יזהה שהעסקה הזו כבר קיימת במערכת (הוא בודק
  // in-donations.nedarim_transaction_id), וייצור לה שורת ייבוא כפולה שתדרוש
  // שיוך ידני נוסף במקום לדלג עליה בשקט
  if (body.ID) fd.set("nedarim_transaction_id", String(body.ID));

  let resultDonationId: string | null = null;
  let resultPledgeId: string | null = null;
  let resultSurplus: number | null = null;
  let resultSurplusCurrency: string | null = null;
  let resultError: string | null = null;

  if (charge.flow === "payment_only") {
    const result = await createDonationWithClient(supabase, charge.created_by ?? null, fd);
    if (!result.ok) resultError = result.error ?? "שגיאה ביצירת התשלום";
    else {
      resultDonationId = result.donationId ?? null;
      resultSurplus = result.surplus ?? null;
      resultSurplusCurrency = result.surplusCurrency ?? null;
    }
  } else {
    const result = await createPledgeWithPaymentUsingClient(supabase, charge.created_by ?? null, fd);
    if (!result.ok) resultError = result.error ?? "שגיאה ביצירת ההתחייבות והתשלום";
    else {
      resultPledgeId = result.pledgeId ?? null;
      resultDonationId = result.donationId ?? null;
    }
  }

  await supabase
    .from("nedarim_pending_charges")
    .update({
      status: resultError ? "failed" : "confirmed",
      error_message: resultError,
      result_donation_id: resultDonationId,
      result_pledge_id: resultPledgeId,
      result_surplus: resultSurplus,
      result_surplus_currency: resultSurplusCurrency,
      nedarim_transaction_id: body.ID ? String(body.ID) : null,
      nedarim_confirmation: body.Confirmation ? String(body.Confirmation) : null,
      nedarim_last4: body.LastNum ? String(body.LastNum) : null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", refId);

  return NextResponse.json({ ok: true });
}
