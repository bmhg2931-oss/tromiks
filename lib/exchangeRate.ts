"use server";

const CURRENCY_CODES: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  CHF: "CHF",
  CAD: "CAD",
  JPY: "JPY",
  AUD: "AUD",
  DKK: "DKK",
  NOK: "NOK",
  ZAR: "ZAR",
  SEK: "SEK",
  JOD: "JOD",
  LBP: "LBP",
  EGP: "EGP",
};

// מטבעות שמתומחרים ע"י בנק ישראל ליחידה של 100/10 (ולא 1) - יש לחלק ביחידה כדי לקבל שער לכל יחידה בודדת
const UNIT_OVERRIDES: Record<string, number> = { JPY: 100, LBP: 10 };

export type ExchangeRateResult = { ok: boolean; rate?: number; asOf?: string; error?: string };

export async function getCurrentExchangeRate(currencySymbol: string): Promise<ExchangeRateResult> {
  const code = CURRENCY_CODES[currencySymbol];
  if (!code) return { ok: false, error: "מטבע לא נתמך" };
  try {
    // שער יציג מתעדכן לכל היותר פעם ביום (בימי עסקים) - שמירה במטמון לשעה מונעת פניה
    // חוזרת לשרת בנק ישראל בכל טעינת עמוד ומשפרת משמעותית את מהירות הניווט באתר.
    const res = await fetch(`https://boi.org.il/PublicApi/GetExchangeRate?key=${code}`, { next: { revalidate: 3600 } });
    if (!res.ok) return { ok: false, error: "שגיאה בשליפת שער יציג" };
    const data = await res.json();
    if (typeof data?.currentExchangeRate !== "number") return { ok: false, error: "תשובה לא תקינה משער יציג" };
    const unit = typeof data.unit === "number" && data.unit > 0 ? data.unit : 1;
    return { ok: true, rate: data.currentExchangeRate / unit, asOf: data.lastUpdate };
  } catch {
    return { ok: false, error: "לא ניתן היה להתחבר לשירות שערי המטבע" };
  }
}

// שער יציג לא מתפרסם בסופ"ש/חג, לכן מחפשים אחורה עד 7 ימים ולוקחים את התצפית האחרונה שנמצאה עד ועד תאריך היעד
export async function getHistoricalExchangeRate(currencySymbol: string, date: string): Promise<ExchangeRateResult> {
  const code = CURRENCY_CODES[currencySymbol];
  if (!code) return { ok: false, error: "מטבע לא נתמך" };
  try {
    const end = new Date(date);
    const start = new Date(end);
    start.setDate(end.getDate() - 7);
    const startPeriod = start.toISOString().slice(0, 10);
    const endPeriod = end.toISOString().slice(0, 10);
    // שער היסטורי לתאריך שכבר עבר לא משתנה יותר - שמירה במטמון ליום מונעת פניה חוזרת מיותרת
    const res = await fetch(
      `https://edge.boi.org.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_${code}_ILS?format=csv&startperiod=${startPeriod}&endperiod=${endPeriod}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return { ok: false, error: "שגיאה בשליפת שער היסטורי" };
    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return { ok: false, error: "לא נמצא שער יציג לתאריך זה" };
    const header = lines[0].split(",");
    const timeIdx = header.indexOf("TIME_PERIOD");
    const valueIdx = header.indexOf("OBS_VALUE");
    const last = lines[lines.length - 1].split(",");
    const rawRate = Number(last[valueIdx]);
    if (!rawRate) return { ok: false, error: "לא נמצא שער יציג לתאריך זה" };
    const unit = UNIT_OVERRIDES[code] ?? 1;
    return { ok: true, rate: rawRate / unit, asOf: last[timeIdx] };
  } catch {
    return { ok: false, error: "לא ניתן היה להתחבר לשירות שערי המטבע" };
  }
}
