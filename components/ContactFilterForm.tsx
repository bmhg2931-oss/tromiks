"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS } from "@/lib/types";
import { FilterIcon, ResetFilterIcon } from "./icons";
import AutocompleteInput from "./AutocompleteInput";
import TagsAutocomplete from "./TagsAutocomplete";
import SelectDropdown from "./SelectDropdown";

const BALANCE_MODE_OPTIONS = [
  { value: "any", label: "הכל" },
  { value: "has", label: "יש יתרת חוב פתוחה" },
  { value: "none", label: "אין יתרת חוב פתוחה" },
  { value: "above", label: "מעל סכום מסוים (₪)" },
  { value: "below", label: "מתחת לסכום מסוים (₪)" },
];

const BALANCE_MODE_LABELS: Record<string, string> = {
  has: 'יש יתרת נדו"נ פתוחה',
  none: 'אין יתרת נדו"נ פתוחה',
  above: 'יתרה מעל',
  below: 'יתרה מתחת ל',
};

export default function ContactFilterForm({
  q: initialQ,
  department: initialDepartment,
  city: initialCity,
  street: initialStreet,
  email: initialEmail,
  tags: initialTags,
  balanceMode: initialBalanceMode,
  balanceAmount: initialBalanceAmount,
  view,
  resultCount,
  totalCount,
  availableCities,
  availableTags,
  canFilterBalance,
}: {
  q?: string;
  department?: string;
  city?: string;
  street?: string;
  email?: string;
  tags?: string;
  balanceMode?: string;
  balanceAmount?: string;
  view: string;
  resultCount: number;
  totalCount: number;
  availableCities: string[];
  availableTags: string[];
  canFilterBalance: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ || "");
  const [department, setDepartment] = useState(initialDepartment || "");
  const [city, setCity] = useState(initialCity || "");
  const [street, setStreet] = useState(initialStreet || "");
  const [email, setEmail] = useState(initialEmail || "");
  const [tags, setTags] = useState<string[]>(initialTags ? initialTags.split(",").filter(Boolean) : []);
  const [balanceMode, setBalanceMode] = useState(initialBalanceMode || "any");
  const [balanceAmount, setBalanceAmount] = useState(initialBalanceAmount || "");
  const [panelOpen, setPanelOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function pushParams(overrides: Partial<{ q: string; department: string; city: string; street: string; email: string; tags: string[]; balanceMode: string; balanceAmount: string }>) {
    const next = {
      q,
      department,
      city,
      street,
      email,
      tags,
      balanceMode,
      balanceAmount,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.department) params.set("department", next.department);
    if (next.city) params.set("city", next.city);
    if (next.street) params.set("street", next.street);
    if (next.email) params.set("email", next.email);
    if (next.tags.length > 0) params.set("tags", next.tags.join(","));
    if (next.balanceMode && next.balanceMode !== "any") {
      params.set("balanceMode", next.balanceMode);
      if ((next.balanceMode === "above" || next.balanceMode === "below") && next.balanceAmount) {
        params.set("balanceAmount", next.balanceAmount);
      }
    }
    params.set("view", view);
    startTransition(() => {
      router.push(`/contacts?${params.toString()}`, { scroll: false });
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
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleBalanceModeChange(next: string) {
    setBalanceMode(next);
    pushParams({ balanceMode: next, balanceAmount: next === "above" || next === "below" ? balanceAmount : "" });
  }

  function clearAll() {
    setDepartment("");
    setCity("");
    setStreet("");
    setEmail("");
    setTags([]);
    setBalanceMode("any");
    setBalanceAmount("");
    pushParams({ department: "", city: "", street: "", email: "", tags: [], balanceMode: "any", balanceAmount: "" });
  }

  function resetAll() {
    setQ("");
    setDepartment("");
    setCity("");
    setStreet("");
    setEmail("");
    setTags([]);
    setBalanceMode("any");
    setBalanceAmount("");
    setPanelOpen(false);
    pushParams({ q: "", department: "", city: "", street: "", email: "", tags: [], balanceMode: "any", balanceAmount: "" });
  }

  const isFiltering = Boolean(q.trim()) || Boolean(department) || Boolean(city) || Boolean(street) || Boolean(email) || tags.length > 0 || balanceMode !== "any";
  const hasPanelFilters = Boolean(department) || Boolean(city) || Boolean(street) || Boolean(email) || tags.length > 0 || balanceMode !== "any";

  const conditionParts: string[] = [];
  if (q.trim()) conditionParts.push(`חיפוש: "${q.trim()}"`);
  if (department) conditionParts.push(`מחלקה: ${department}`);
  if (city) conditionParts.push(`עיר: ${city}`);
  if (street) conditionParts.push(`רחוב: "${street}"`);
  if (email) conditionParts.push(`דוא"ל: "${email}"`);
  if (tags.length > 0) conditionParts.push(`תגיות: ${tags.join(", ")}`);
  if (balanceMode !== "any") {
    conditionParts.push(
      balanceMode === "above" || balanceMode === "below"
        ? `${BALANCE_MODE_LABELS[balanceMode]} ${balanceAmount || 0}₪`
        : BALANCE_MODE_LABELS[balanceMode]
    );
  }

  return (
    <div className="flex flex-col gap-1 w-80 shrink-0">
      <div className="relative" ref={wrapRef}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='חיפוש לפי שם, טלפון או דוא"ל...'
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
              <label className="block text-xs font-semibold text-ink-soft mb-1">מחלקה</label>
              <AutocompleteInput
                value={department}
                onChange={(v) => {
                  setDepartment(v);
                  pushParams({ department: v });
                }}
                options={DEPARTMENTS}
                placeholder="כל המחלקות..."
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
              <label className="block text-xs font-semibold text-ink-soft mb-1">רחוב</label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                onBlur={() => pushParams({ street })}
                onKeyDown={(e) => e.key === "Enter" && pushParams({ street })}
                placeholder="שם רחוב..."
                className="in"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">דוא&quot;ל</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => pushParams({ email })}
                onKeyDown={(e) => e.key === "Enter" && pushParams({ email })}
                placeholder="חלק מכתובת המייל..."
                className="in"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">תגיות</label>
              <TagsAutocomplete
                selected={tags}
                onChange={(next) => {
                  setTags(next);
                  pushParams({ tags: next });
                }}
                options={availableTags}
              />
            </div>

            {canFilterBalance && (
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">יתרת נדו&quot;נ</label>
                <SelectDropdown value={balanceMode} onChange={handleBalanceModeChange} options={BALANCE_MODE_OPTIONS} />
                {(balanceMode === "above" || balanceMode === "below") && (
                  <input
                    type="number"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    onBlur={() => pushParams({ balanceAmount })}
                    onKeyDown={(e) => e.key === "Enter" && pushParams({ balanceAmount })}
                    placeholder="סכום בשקלים..."
                    className="in mt-2"
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isFiltering && (
        <p className="text-xs text-ink-soft px-2">
          {conditionParts.join(" · ")} | מוצגים {resultCount} מתוך {totalCount} אנשי קשר
        </p>
      )}
    </div>
  );
}
