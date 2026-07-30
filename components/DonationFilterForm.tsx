"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_HUBS } from "@/lib/types";
import { FilterIcon, ResetFilterIcon } from "./icons";
import AutocompleteInput from "./AutocompleteInput";
import SelectDropdown from "./SelectDropdown";

const RECORD_TYPE_OPTIONS = [
  { value: "", label: "כל הסוגים" },
  { value: "pledge", label: "התחייבות" },
  { value: "payment", label: "תשלום" },
  { value: "combined", label: "התחייבות ותשלום" },
];

const STATUS_OPTIONS = [
  { value: "", label: "כל הסטטוסים" },
  { value: "שולם", label: "שולם" },
  { value: "ממתין", label: "ממתין" },
  { value: "נכשל", label: "נכשל" },
  { value: "בוטל", label: "בוטל" },
  { value: "מוחזר", label: "מוחזר" },
];

const PAYMENT_HUB_OPTIONS = [{ value: "", label: "כל המוקדים" }, ...PAYMENT_HUBS.map((h) => ({ value: h, label: h }))];

export default function DonationFilterForm({
  q: initialQ,
  status: initialStatus,
  recordType: initialRecordType,
  category: initialCategory,
  city: initialCity,
  paymentHub: initialPaymentHub,
  amountMin: initialAmountMin,
  amountMax: initialAmountMax,
  resultCount,
  totalCount,
  availableCategories,
  availableCities,
}: {
  q?: string;
  status?: string;
  recordType?: string;
  category?: string;
  city?: string;
  paymentHub?: string;
  amountMin?: string;
  amountMax?: string;
  resultCount: number;
  totalCount: number;
  availableCategories: string[];
  availableCities: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ || "");
  const [status, setStatus] = useState(initialStatus || "");
  const [recordType, setRecordType] = useState(initialRecordType || "");
  const [category, setCategory] = useState(initialCategory || "");
  const [city, setCity] = useState(initialCity || "");
  const [paymentHub, setPaymentHub] = useState(initialPaymentHub || "");
  const [amountMin, setAmountMin] = useState(initialAmountMin || "");
  const [amountMax, setAmountMax] = useState(initialAmountMax || "");
  const [panelOpen, setPanelOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  type Overrides = Partial<{
    q: string;
    status: string;
    recordType: string;
    category: string;
    city: string;
    paymentHub: string;
    amountMin: string;
    amountMax: string;
  }>;

  function pushParams(overrides: Overrides) {
    const next = { q, status, recordType, category, city, paymentHub, amountMin, amountMax, ...overrides };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.status) params.set("status", next.status);
    if (next.recordType) params.set("recordType", next.recordType);
    if (next.category) params.set("category", next.category);
    if (next.city) params.set("city", next.city);
    if (next.paymentHub) params.set("paymentHub", next.paymentHub);
    if (next.amountMin) params.set("amountMin", next.amountMin);
    if (next.amountMax) params.set("amountMax", next.amountMax);
    startTransition(() => {
      router.push(`/donations?${params.toString()}`, { scroll: false });
    });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPanelOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function clearAll() {
    setStatus("");
    setRecordType("");
    setCategory("");
    setCity("");
    setPaymentHub("");
    setAmountMin("");
    setAmountMax("");
    pushParams({ status: "", recordType: "", category: "", city: "", paymentHub: "", amountMin: "", amountMax: "" });
  }

  function resetAll() {
    setQ("");
    clearAll();
    setPanelOpen(false);
    pushParams({ q: "", status: "", recordType: "", category: "", city: "", paymentHub: "", amountMin: "", amountMax: "" });
  }

  const hasPanelFilters = Boolean(status || recordType || category || city || paymentHub || amountMin || amountMax);
  const isFiltering = Boolean(q.trim()) || hasPanelFilters;

  const conditionParts: string[] = [];
  if (q.trim()) conditionParts.push(`חיפוש: "${q.trim()}"`);
  if (recordType) conditionParts.push(`סוג: ${RECORD_TYPE_OPTIONS.find((o) => o.value === recordType)?.label}`);
  if (category) conditionParts.push(`קטגוריה: ${category}`);
  if (city) conditionParts.push(`עיר: ${city}`);
  if (paymentHub) conditionParts.push(`מוקד: ${paymentHub}`);
  if (status) conditionParts.push(`סטטוס: ${status}`);
  if (amountMin || amountMax) {
    conditionParts.push(
      amountMin && amountMax ? `סכום: ${amountMin}-${amountMax}` : amountMin ? `סכום מעל ${amountMin}` : `סכום מתחת ל-${amountMax}`
    );
  }

  return (
    <div className="flex flex-col gap-1 w-80 shrink-0">
      <div className="relative" ref={wrapRef}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם תורם או סלולארי..."
          className="search-glow h-9 border border-[#e8e4d9] rounded-full pr-5 pl-16 text-sm w-full"
        />
        <div className="absolute top-1/2 left-1 -translate-y-1/2 flex items-center gap-1">
          {isFiltering && (
            <button
              type="button"
              onClick={resetAll}
              aria-label="איפוס סינון"
              title="איפוס סינון"
              className="w-7 h-7 rounded-full flex items-center justify-center border border-line text-ink-soft hover:bg-wine hover:text-white hover:border-wine transition"
            >
              <ResetFilterIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label="סינון נוסף"
            className={`w-7 h-7 rounded-full flex items-center justify-center border transition ${
              hasPanelFilters ? "bg-brass text-white border-brass" : "border-line text-ink-soft hover:bg-parchment"
            }`}
          >
            <FilterIcon />
          </button>
        </div>

        {panelOpen && (
          <div className="absolute z-30 top-full mt-2 left-0 bg-white border border-line/60 rounded-2xl shadow-xl p-4 w-72 max-h-[70vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">סינון מתקדם</h3>
              {hasPanelFilters && (
                <button type="button" onClick={clearAll} className="text-xs text-wine hover:underline">
                  נקה הכל
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">סוג רשומה</label>
              <SelectDropdown
                value={recordType}
                onChange={(v) => {
                  setRecordType(v);
                  pushParams({ recordType: v });
                }}
                options={RECORD_TYPE_OPTIONS}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">קטגוריה</label>
              <AutocompleteInput
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  pushParams({ category: v });
                }}
                options={availableCategories}
                placeholder="כל הקטגוריות..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">עיר</label>
              <AutocompleteInput
                value={city}
                onChange={(v) => {
                  setCity(v);
                  pushParams({ city: v });
                }}
                options={availableCities}
                placeholder="כל הערים..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">מוקד תשלום</label>
              <SelectDropdown
                value={paymentHub}
                onChange={(v) => {
                  setPaymentHub(v);
                  pushParams({ paymentHub: v });
                }}
                options={PAYMENT_HUB_OPTIONS}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">סטטוס</label>
              <SelectDropdown
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  pushParams({ status: v });
                }}
                options={STATUS_OPTIONS}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">טווח סכום</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  onBlur={() => pushParams({ amountMin })}
                  onKeyDown={(e) => e.key === "Enter" && pushParams({ amountMin })}
                  placeholder="מ-"
                  className="in"
                />
                <span className="text-ink-soft text-xs">עד</span>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  onBlur={() => pushParams({ amountMax })}
                  onKeyDown={(e) => e.key === "Enter" && pushParams({ amountMax })}
                  placeholder="עד"
                  className="in"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isFiltering && (
        <p className="text-xs text-ink-soft px-2">
          {conditionParts.join(" · ")} | מוצגות {resultCount} מתוך {totalCount} רשומות
        </p>
      )}
    </div>
  );
}
