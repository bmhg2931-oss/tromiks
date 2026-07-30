"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENCIES, EXTRA_CURRENCIES } from "@/lib/types";

// 6 מטבעות ראשונים ברשימה הצרה (שקל, דולר, אירו, ליש"ט + שני המטבעות הנפוצים הבאים),
// שאר המטבעות זמינים ברשימה המורחבת אחרי לחיצה על "•••"
const PRIMARY_CURRENCIES = [...CURRENCIES, ...EXTRA_CURRENCIES.slice(0, 2)];
const MORE_CURRENCIES = EXTRA_CURRENCIES.slice(2);

export default function CurrencyAmountField({
  currencyName,
  amountName,
  currency,
  onCurrencyChange,
  amount,
  onAmountChange,
  readOnly,
}: {
  currencyName: string;
  amountName: string;
  currency: string;
  onCurrencyChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function pick(c: string) {
    onCurrencyChange(c);
    setOpen(false);
    setExpanded(false);
  }

  return (
    <div className="relative" ref={ref}>
      <div className={`in h-11 flex items-center p-0 ${readOnly ? "bg-parchment/60" : ""}`}>
        <input
          type="number"
          name={amountName}
          min="1"
          step="0.01"
          required
          readOnly={readOnly}
          placeholder="סכום *"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="flex-1 h-full min-w-0 border-0 bg-transparent focus:outline-none px-2.5"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 h-full px-2.5 text-sm font-semibold text-ink-soft hover:text-ink border-l border-line"
        >
          {currency}
        </button>
      </div>
      <input type="hidden" name={currencyName} value={currency} />

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-24 bg-white border border-line rounded-lg shadow-lg overflow-hidden">
          {!expanded ? (
            <>
              {PRIMARY_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className={`block w-full text-center px-3 py-1.5 text-sm hover:bg-parchment border-b border-line ${
                    currency === c ? "font-bold text-brass-deep" : ""
                  }`}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="block w-full text-center px-3 py-1.5 text-sm hover:bg-parchment text-ink-soft"
              >
                •••
              </button>
            </>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {MORE_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className={`block w-full text-center px-3 py-1.5 text-sm hover:bg-parchment border-b border-line last:border-b-0 ${
                    currency === c ? "font-bold text-brass-deep" : ""
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
