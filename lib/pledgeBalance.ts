import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentExchangeRate, getHistoricalExchangeRate } from "./exchangeRate";

type DatedAmount = { contact_id: string; amount: number; currency: string; date: string };

// ממיר כל שורה (התחייבות/תשלום) לש"ח לפי השער ההיסטורי שהיה בתוקף בתאריך שלה (תאריך
// ההתחייבות עבור נדו"ן, תאריך התשלום עבור תרומה בפועל) - לא לפי השער הנוכחי - ומצרף
// לפי איש קשר
async function sumToILSByDate(rows: DatedAmount[]): Promise<Map<string, number>> {
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
    sums.set(r.contact_id, (sums.get(r.contact_id) || 0) + r.amount * rate);
  }
  return sums;
}

// יתרת נדו"ן היא אגרגט: סך כל ההתחייבויות (שלא בוטלו) פחות סך כל התשלומים של איש הקשר,
// בלי קשר לשיוך פרטני בין תשלום להתחייבות ספציפית. כל שורה מומרת לש"ח לפי השער שהיה
// בתוקף בתאריך שלה (לא השער הנוכחי), והתוצאה היא יתרת בסיס בש"ח - לצורך תצוגה במטבע
// אחר יש להמיר את התוצאה הסופית דרך convertBalanceMap
export async function getContactBalances(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [{ data: pledges }, { data: donations }] = await Promise.all([
    supabase.from("pledges").select("contact_id, amount, currency, pledge_date").neq("status", "בוטל"),
    supabase.from("donations").select("contact_id, amount, currency, donation_date"),
  ]);

  const [pledgeILS, donationILS] = await Promise.all([
    sumToILSByDate((pledges ?? []).map((p) => ({ contact_id: p.contact_id, amount: Number(p.amount), currency: p.currency, date: p.pledge_date }))),
    sumToILSByDate((donations ?? []).map((d) => ({ contact_id: d.contact_id, amount: Number(d.amount), currency: d.currency, date: d.donation_date }))),
  ]);

  const contactIds = new Set([...pledgeILS.keys(), ...donationILS.keys()]);
  const balances = new Map<string, number>();
  for (const id of contactIds) {
    balances.set(id, (pledgeILS.get(id) || 0) - (donationILS.get(id) || 0));
  }
  return balances;
}

// סך כל ההתחייבויות (שלא בוטלו) של איש קשר, בש"ח לפי שער היסטורי - ללא קיזוז תשלומים
// (בשונה מ-getContactBalances) - משמש כנתון עזר כללי בעת מיפוי קמפיין-אב
export async function getContactTotalPledges(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data: pledges } = await supabase.from("pledges").select("contact_id, amount, currency, pledge_date").neq("status", "בוטל");
  return sumToILSByDate(
    (pledges ?? []).map((p) => ({ contact_id: p.contact_id, amount: Number(p.amount), currency: p.currency, date: p.pledge_date }))
  );
}

// ממיר מפת יתרות בש"ח (התוצאה של getContactBalances) למטבע התצוגה הנבחר, לפי השער
// היציג הנוכחי (לא היסטורי) - זהו שלב תצוגה בלבד, שמופרד מחישוב הבסיס בש"ח כדי
// שסינון/השוואת סף יתרה (במסך אנשי הקשר) ימשיך להתבצע תמיד בש"ח בעקביות
export async function convertBalanceMap(balancesILS: Map<string, number>, displayCurrency: string): Promise<Map<string, number>> {
  if (displayCurrency === "₪") return balancesILS;
  const result = await getCurrentExchangeRate(displayCurrency);
  if (!result.ok || !result.rate) return balancesILS;
  const rate = result.rate;
  const converted = new Map<string, number>();
  for (const [id, ils] of balancesILS.entries()) converted.set(id, ils / rate);
  return converted;
}

// עיצוב יתרה להצגה בעמודת "יתרה פתוחה": רק חוב חיובי מוצג בפועל - זיכוי (יתרה שלילית)
// אינו רלוונטי לעמודה זו ומוצג כ"—" בדיוק כמו העדר יתרה
export function formatOpenBalance(balance: number, currency: string = "₪"): string {
  if (balance > 0.5) return `${currency}${Math.round(balance).toLocaleString("he-IL")}`;
  return "—";
}
