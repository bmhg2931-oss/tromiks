"use client";

import { useState } from "react";
import { CURRENCIES, EXTRA_CURRENCIES } from "@/lib/types";

export default function CurrencySelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showExtra, setShowExtra] = useState(() => EXTRA_CURRENCIES.includes(value));

  return (
    <div>
      {!showExtra ? (
        <div className="flex flex-wrap gap-1.5">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={`px-2 py-0.5 rounded-md text-xs font-semibold border transition ${
                value === c ? "bg-brass text-white border-brass" : "border-line bg-white hover:bg-parchment"
              }`}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setShowExtra(true);
              onChange(EXTRA_CURRENCIES[0]);
            }}
            className="px-2 py-0.5 rounded-md text-xs font-semibold border border-line bg-white hover:bg-parchment transition"
          >
            מטבעות נוספים
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select value={value} onChange={(e) => onChange(e.target.value)} className="in flex-1">
            {EXTRA_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setShowExtra(false);
              onChange(CURRENCIES[0]);
            }}
            className="text-xs text-brass-deep underline shrink-0"
          >
            חזרה
          </button>
        </div>
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
