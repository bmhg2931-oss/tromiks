"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DEPARTMENTS } from "@/lib/types";
import { FilterIcon } from "./icons";
import { stripLeadingZeros } from "@/lib/validation";

export type PickerContact = { id: string; first_name: string; last_name: string; phone: string; department: string | null };

export default function CampaignAudiencePickerModal({
  contacts,
  initialSelectedIds,
  onConfirm,
  onClose,
}: {
  contacts: PickerContact[];
  initialSelectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return contacts.filter((c) => {
      if (department && c.department !== department) return false;
      if (words.length === 0) return true;
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      const phoneWord = stripLeadingZeros(words[words.length - 1] ?? "");
      return words.every((w) => name.includes(w)) || c.phone.includes(phoneWord);
    });
  }, [contacts, q, department]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of filtered) next.add(c.id);
      return next;
    });
  }

  function clearAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of filtered) next.delete(c.id);
      return next;
    });
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-3xl w-full max-h-[88vh] flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="font-serif text-xl font-bold">בחירת אנשי קשר לקהל היעד</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='חיפוש לפי שם, טלפון או דוא"ל...'
              className="search-glow h-9 border border-[#e8e4d9] rounded-full pr-5 pl-4 text-sm w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-label="סינון"
            className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center border transition ${
              department ? "bg-brass text-white border-brass" : "border-line text-ink-soft hover:bg-parchment"
            }`}
          >
            <FilterIcon />
          </button>
        </div>

        {filterOpen && (
          <div className="mb-3 p-3 border border-line rounded-lg bg-parchment/40 shrink-0">
            <label className="block text-xs font-semibold text-ink-soft mb-1">מחלקה</label>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="in max-w-xs">
              <option value="">כל המחלקות</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-ink-soft mb-2 shrink-0">
          <span>{selected.size} נבחרו · {filtered.length} מוצגים</span>
          <div className="flex gap-3">
            <button type="button" onClick={selectAllFiltered} className="text-brass-deep hover:underline">
              סמן הכל בתצוגה
            </button>
            <button type="button" onClick={clearAllFiltered} className="text-wine hover:underline">
              נקה הכל בתצוגה
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border border-line rounded-xl">
          {filtered.map((c) => (
            <label
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#e6e3da] last:border-b-0 hover:bg-parchment/40 cursor-pointer"
            >
              <div>
                <div className="font-semibold text-sm">
                  {c.first_name} {c.last_name}
                </div>
                <div className="text-[11px] text-ink-soft">
                  {c.phone}
                  {c.department && ` · ${c.department}`}
                </div>
              </div>
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="appearance-none w-6 h-6 rounded-full border-2 border-line checked:bg-brass checked:border-brass shrink-0 cursor-pointer transition relative
                  checked:after:content-['✓'] checked:after:absolute checked:after:inset-0 checked:after:flex checked:after:items-center checked:after:justify-center checked:after:text-white checked:after:text-xs"
              />
            </label>
          ))}
        </div>

        <div className="flex justify-center pt-4 shrink-0">
          <button
            type="button"
            onClick={() => onConfirm(Array.from(selected))}
            className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-6 py-2.5 text-sm transition"
          >
            אישור בחירה ({selected.size})
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
