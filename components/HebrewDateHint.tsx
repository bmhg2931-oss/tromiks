"use client";

import { describeHebrewDate, parseLocalISODate } from "@/lib/hebrewDate";

export default function HebrewDateHint({ dateStr, attached }: { dateStr: string; attached?: boolean }) {
  const { hebrewDate, weekday, parsha } = describeHebrewDate(parseLocalISODate(dateStr));
  return (
    <div
      className={
        attached
          ? "text-[11px] text-ink-soft"
          : "text-xs text-ink-soft bg-parchment rounded-lg px-3 py-2 leading-relaxed flex items-center"
      }
    >
      {hebrewDate} | יום {weekday}
      {parsha && <> | {parsha}</>}
    </div>
  );
}
