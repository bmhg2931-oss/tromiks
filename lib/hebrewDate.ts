import { HDate, HebrewCalendar, gematriya } from "@hebcal/core";

export const HEBREW_MONTH_NAMES: Record<string, string> = {
  Nisan: "ניסן",
  Iyyar: "אייר",
  Sivan: "סיוון",
  Tamuz: "תמוז",
  Av: "אב",
  Elul: "אלול",
  Tishrei: "תשרי",
  Cheshvan: "חשוון",
  Kislev: "כסלו",
  Tevet: "טבת",
  "Sh'vat": "שבט",
  Adar: "אדר",
  "Adar I": "אדר א'",
  "Adar II": "אדר ב'",
};

const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function stripNiqqud(s: string): string {
  return s.replace(/־/g, "-").replace(/[֑-ׇ]/g, "");
}

export function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function describeHebrewDate(date: Date): { hebrewDate: string; weekday: string; parsha: string | null } {
  const hd = new HDate(date);
  const monthName = HEBREW_MONTH_NAMES[hd.getMonthName()] ?? hd.getMonthName();
  const hebrewDate = `${gematriya(hd.getDate())} ${monthName} ${gematriya(hd.getFullYear())}`;
  const weekday = WEEKDAY_NAMES[date.getDay()];

  let parsha: string | null = null;
  try {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const events = HebrewCalendar.calendar({ start, end, sedrot: true, il: true, noHolidays: true });
    if (events.length > 0) parsha = stripNiqqud(events[0].render("he"));
  } catch {
    parsha = null;
  }

  return { hebrewDate, weekday, parsha };
}
