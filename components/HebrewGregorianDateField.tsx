"use client";

import { useState } from "react";
import { HDate, gematriya } from "@hebcal/core";
import { HEBREW_MONTH_NAMES, toLocalISODate, parseLocalISODate } from "@/lib/hebrewDate";

const CURRENT_HEBREW_YEAR = new HDate().getFullYear();
const MAX_HEBREW_YEAR = 5900; // תת"ק
const MIN_HEBREW_YEAR = CURRENT_HEBREW_YEAR - 127;
const IN = "border border-line rounded-lg px-2.5 py-2 text-sm bg-white";

export default function HebrewGregorianDateField({
  name,
  initial,
  disabled,
}: {
  name: string;
  initial?: string | null;
  disabled?: boolean;
}) {
  const [date, setDate] = useState<Date>(() => (initial ? parseLocalISODate(initial) : new Date()));
  const [error, setError] = useState<string | null>(null);

  const hd = new HDate(date);
  const hYear = hd.getFullYear();
  const hMonth = hd.getMonth();
  const hDay = hd.getDate();
  const monthsInYear = HDate.monthsInYear(hYear);
  const daysInMonth = HDate.daysInMonth(hMonth, hYear);

  function handleGregorianChange(value: string) {
    if (!value) return;
    const parsed = parseLocalISODate(value);
    if (Number.isNaN(parsed.getTime())) {
      setError("תאריך לא תקין");
      return;
    }
    setDate(parsed);
    setError(null);
  }

  function updateHebrew(newDay: number, newMonth: number, newYear: number) {
    try {
      const clampedDay = Math.min(newDay, HDate.daysInMonth(newMonth, newYear));
      const nextHd = new HDate(clampedDay, newMonth, newYear);
      setDate(nextHd.greg());
      setError(null);
    } catch {
      setError("תאריך עברי לא תקין");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">תאריך הצטרפות (לועזי)</label>
          <input
            type="date"
            value={toLocalISODate(date)}
            onChange={(e) => handleGregorianChange(e.target.value)}
            disabled={disabled}
            className={`w-full ${IN}`}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">תאריך הצטרפות (עברי)</label>
          <div className="flex gap-1.5">
            <select
              value={hDay}
              onChange={(e) => updateHebrew(Number(e.target.value), hMonth, hYear)}
              disabled={disabled}
              className={`${IN} shrink-0 w-[64px]`}
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {gematriya(d)}
                </option>
              ))}
            </select>
            <select
              value={hMonth}
              onChange={(e) => updateHebrew(hDay, Number(e.target.value), hYear)}
              disabled={disabled}
              className={`${IN} flex-1 min-w-0`}
            >
              {Array.from({ length: monthsInYear }, (_, i) => i + 1).map((m) => {
                const label = HEBREW_MONTH_NAMES[new HDate(1, m, hYear).getMonthName()] ?? String(m);
                return (
                  <option key={m} value={m}>
                    {label}
                  </option>
                );
              })}
            </select>
            <select
              value={hYear}
              onChange={(e) => updateHebrew(hDay, hMonth, Number(e.target.value))}
              disabled={disabled}
              className={`${IN} shrink-0 w-[84px]`}
            >
              {Array.from({ length: MAX_HEBREW_YEAR - MIN_HEBREW_YEAR + 1 }, (_, i) => MAX_HEBREW_YEAR - i).map((y) => (
                <option key={y} value={y}>
                  {gematriya(y)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-wine mt-1">{error}</p>}
      <input type="hidden" name={name} value={toLocalISODate(date)} />
    </div>
  );
}
