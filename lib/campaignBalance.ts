import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentExchangeRate, getHistoricalExchangeRate } from "./exchangeRate";
import type { Campaign } from "./types";

type DatedAmount = { campaign_id: string; amount: number; currency: string; date: string };

async function sumToILSByCampaign(rows: DatedAmount[]): Promise<Map<string, number>> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.currency !== "₪") keys.add(`${r.currency}|${r.date}`);
  }
  const rates = new Map<string, number>();
  await Promise.all(
    Array.from(keys).map(async (key) => {
      const [cur, date] = key.split("|");
      const result = await getHistoricalExchangeRate(cur, date);
      if (result.ok && result.rate) rates.set(key, result.rate);
    })
  );

  const sums = new Map<string, number>();
  for (const r of rows) {
    const rate = r.currency === "₪" ? 1 : rates.get(`${r.currency}|${r.date}`) ?? 0;
    sums.set(r.campaign_id, (sums.get(r.campaign_id) || 0) + r.amount * rate);
  }
  return sums;
}

export type CampaignTotals = { pledgedILS: number; paidILS: number };

// סכום ישיר (בש"ח, לפי שער היסטורי בתאריך כל רשומה) של התחייבויות ותשלומים ששויכו
// ישירות לצומת קמפיין ספציפי (קמפיין-אב או תת-קמפיין) - ללא צירוף מתת-קמפיינים
export async function getCampaignDirectTotals(supabase: SupabaseClient): Promise<Map<string, CampaignTotals>> {
  const [{ data: pledges }, { data: donations }] = await Promise.all([
    supabase.from("pledges").select("campaign_id, amount, currency, pledge_date").not("campaign_id", "is", null).neq("status", "בוטל"),
    supabase.from("donations").select("campaign_id, amount, currency, donation_date").not("campaign_id", "is", null),
  ]);

  const [pledgedILS, paidILS] = await Promise.all([
    sumToILSByCampaign(
      (pledges ?? []).map((p) => ({ campaign_id: p.campaign_id as string, amount: Number(p.amount), currency: p.currency, date: p.pledge_date }))
    ),
    sumToILSByCampaign(
      (donations ?? []).map((d) => ({ campaign_id: d.campaign_id as string, amount: Number(d.amount), currency: d.currency, date: d.donation_date }))
    ),
  ]);

  const campaignIds = new Set([...pledgedILS.keys(), ...paidILS.keys()]);
  const totals = new Map<string, CampaignTotals>();
  for (const id of campaignIds) {
    totals.set(id, { pledgedILS: pledgedILS.get(id) || 0, paidILS: paidILS.get(id) || 0 });
  }
  return totals;
}

// מצרף לכל קמפיין-אב את הסכומים הישירים שלו + סך כל תתי-הקמפיינים שלו (רמת קינון
// אחת בלבד, כך שתת-קמפיין תמיד "עלה" - הסכום שלו הוא הסכום הישיר שלו בלבד)
export function rollupCampaignTotals(campaigns: Campaign[], direct: Map<string, CampaignTotals>): Map<string, CampaignTotals> {
  const rolled = new Map<string, CampaignTotals>();
  for (const c of campaigns) {
    if (c.parent_campaign_id) {
      rolled.set(c.id, direct.get(c.id) ?? { pledgedILS: 0, paidILS: 0 });
      continue;
    }
    const own = direct.get(c.id) ?? { pledgedILS: 0, paidILS: 0 };
    const children = campaigns.filter((x) => x.parent_campaign_id === c.id);
    let pledgedILS = own.pledgedILS;
    let paidILS = own.paidILS;
    for (const child of children) {
      const childTotal = direct.get(child.id) ?? { pledgedILS: 0, paidILS: 0 };
      pledgedILS += childTotal.pledgedILS;
      paidILS += childTotal.paidILS;
    }
    rolled.set(c.id, { pledgedILS, paidILS });
  }
  return rolled;
}

// ממיר סכום בש"ח למטבע היעד לפי השער היציג הנוכחי (לצורך תצוגת התקדמות מול יעד
// קמפיין) - שער אחד מכל מטבע נשלף פעם אחת ומשמש לכל הקמפיינים המשתמשים בו
export async function convertILSAmounts(
  totals: Map<string, CampaignTotals>,
  currencyByCampaign: Map<string, string>
): Promise<Map<string, { pledged: number; paid: number }>> {
  const currencies = new Set(Array.from(currencyByCampaign.values()).filter((c) => c !== "₪"));
  const rates = new Map<string, number>();
  await Promise.all(
    Array.from(currencies).map(async (cur) => {
      const result = await getCurrentExchangeRate(cur);
      if (result.ok && result.rate) rates.set(cur, result.rate);
    })
  );

  const converted = new Map<string, { pledged: number; paid: number }>();
  for (const [id, t] of totals.entries()) {
    const currency = currencyByCampaign.get(id) ?? "₪";
    const rate = currency === "₪" ? 1 : rates.get(currency) ?? null;
    if (!rate) {
      converted.set(id, { pledged: t.pledgedILS, paid: t.paidILS });
      continue;
    }
    converted.set(id, { pledged: t.pledgedILS / rate, paid: t.paidILS / rate });
  }
  return converted;
}
