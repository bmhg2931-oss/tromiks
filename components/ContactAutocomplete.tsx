"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ContactDetailPanel from "./ContactDetailPanel";
import type { Contact } from "@/lib/types";
import { stripLeadingZeros } from "@/lib/validation";
import { getCurrentExchangeRate } from "@/lib/exchangeRate";

export type ContactWithBalance = Contact & { outstandingBalances: Record<string, number> };

export default function ContactAutocomplete({
  onSelect,
  initialContact,
}: {
  onSelect: (contact: ContactWithBalance) => void;
  initialContact?: Contact;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<ContactWithBalance | null>(null);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialContact) handlePick(initialContact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient();
      const words = query.trim().split(/\s+/).filter(Boolean);
      let queryBuilder = supabase.from("contacts").select("*");
      for (const word of words) {
        const w = word.replace(/[,()]/g, "");
        const phoneWord = stripLeadingZeros(w);
        queryBuilder = queryBuilder.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,phone.ilike.%${phoneWord}%`);
      }
      const { data } = await queryBuilder.limit(8);
      setResults(data ?? []);
      setShowDropdown(true);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  async function handlePick(contact: Contact) {
    const supabase = createClient();
    // שיוך תרומה להתחייבות ספציפית הוא הערה לנוחות בלבד ולא פיצול חשבונאי מדויק,
    // לכן היתרה הפתוחה מחושבת כאגרגט: כל ההתחייבויות (שלא בוטלו) מול כל התרומות של
    // איש הקשר יחד, ולא לפי שיוך פרטני של כל תרומה להתחייבות שלה.
    const [{ data: pledges }, { data: donations }] = await Promise.all([
      supabase.from("pledges").select("amount, currency").eq("contact_id", contact.id).neq("status", "בוטל"),
      supabase.from("donations").select("amount, currency").eq("contact_id", contact.id),
    ]);

    const pledgedByCurrency: Record<string, number> = {};
    for (const p of pledges ?? []) {
      pledgedByCurrency[p.currency] = (pledgedByCurrency[p.currency] || 0) + Number(p.amount);
    }
    const paidByCurrency: Record<string, number> = {};
    for (const d of donations ?? []) {
      paidByCurrency[d.currency] = (paidByCurrency[d.currency] || 0) + Number(d.amount);
    }

    const currencies = new Set([...Object.keys(pledgedByCurrency), ...Object.keys(paidByCurrency)]);
    const balances: Record<string, number> = {};
    for (const cur of currencies) {
      const net = (pledgedByCurrency[cur] || 0) - (paidByCurrency[cur] || 0);
      if (net > 0.009) balances[cur] = net;
    }

    const withBalance: ContactWithBalance = { ...contact, outstandingBalances: balances };
    setSelected(withBalance);
    setQuery(`${contact.first_name} ${contact.last_name}`);
    setShowDropdown(false);
    onSelect(withBalance);

    // סה"כ ממוזג לשקלים לפי שער יציג נוכחי - זה המספר הקובע בפועל (גם תשלום במטבע אחד
    // מקזז יתרה במטבע אחר), הפירוט לפי מטבע למעלה הוא רק לשקיפות
    setConvertedTotal(null);
    const otherCurrencies = Array.from(currencies).filter((cur) => cur !== "₪");
    const rateResults = await Promise.all(otherCurrencies.map((cur) => getCurrentExchangeRate(cur)));
    const ok = rateResults.every((r) => r.ok && r.rate);
    if (ok) {
      let total = pledgedByCurrency["₪"] !== undefined || paidByCurrency["₪"] !== undefined
        ? (pledgedByCurrency["₪"] || 0) - (paidByCurrency["₪"] || 0)
        : 0;
      otherCurrencies.forEach((cur, i) => {
        const net = (pledgedByCurrency[cur] || 0) - (paidByCurrency[cur] || 0);
        total += net * (rateResults[i].rate ?? 0);
      });
      setConvertedTotal(total);
    }
  }

  function handleClear() {
    setSelected(null);
    setConvertedTotal(null);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && results.length === 1) {
      e.preventDefault();
      handlePick(results[0]);
    }
  }

  const fullAddress = selected ? [selected.street, selected.house_number, selected.city].filter(Boolean).join(" ") : "";

  return (
    <div className="relative">
      {!selected ? (
        <>
          <label className="block text-xs font-semibold text-ink-soft mb-1">שם או סלולארי *</label>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selected) setSelected(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="הקלד שם או מספר טלפון..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
          />
          {showDropdown && results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePick(c)}
                  className="block w-full text-right px-3 py-2 text-sm hover:bg-parchment border-b border-line last:border-b-0"
                >
                  <span className="font-semibold">
                    {c.first_name} {c.last_name}
                  </span>
                  <span className="text-ink-soft"> · {c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-parchment border border-line rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-semibold">
                {selected.first_name} {selected.last_name}
              </div>
              {fullAddress && <div className="text-ink-soft text-xs">{fullAddress}</div>}
              <div className="text-ink-soft text-xs">{selected.phone}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowContactPanel(true)}
                aria-label="מעבר לאיש קשר"
                title="מעבר לאיש קשר"
                className="w-7 h-7 rounded-full border border-line bg-white text-ink-soft hover:bg-parchment-deep hover:text-ink transition flex items-center justify-center"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="5" r="2.8" />
                  <path d="M2.5 14c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-wine border border-wine/40 rounded-full px-3 py-1 hover:bg-wine hover:text-white transition"
              >
                החלף
              </button>
            </div>
          </div>
          <div className="text-xs">
            <span className="font-semibold text-ink-soft">יתרת נדו&quot;נ שלא שולמה: </span>
            {convertedTotal !== null
              ? convertedTotal <= 0.009
                ? convertedTotal < -0.5
                  ? `אין יתרה פתוחה (זיכוי ע"ס ₪${Math.abs(convertedTotal).toLocaleString("he-IL", { maximumFractionDigits: 0 })})`
                  : "אין יתרה פתוחה"
                : `₪${convertedTotal.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`
              : Object.keys(selected.outstandingBalances).length === 0
                ? "אין יתרה פתוחה"
                : Object.entries(selected.outstandingBalances)
                    .map(([cur, amt]) => `${cur}${amt.toLocaleString("he-IL")}`)
                    .join(" · ")}
          </div>
          {convertedTotal !== null && convertedTotal > 0.009 && Object.keys(selected.outstandingBalances).length > 1 && (
            <div className="text-xs text-ink-soft">
              פירוט לפי מטבע:{" "}
              {Object.entries(selected.outstandingBalances)
                .map(([cur, amt]) => `${cur}${amt.toLocaleString("he-IL")}`)
                .join(" · ")}
            </div>
          )}
        </div>
      )}
      <input type="hidden" name="contact_id" value={selected?.id ?? ""} />

      {showContactPanel && selected && (
        <ContactDetailPanel id={selected.id} editable onClose={() => setShowContactPanel(false)} />
      )}
    </div>
  );
}
