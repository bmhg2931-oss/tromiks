"use client";

import { useMemo, useState } from "react";
import ContactRow from "./ContactRow";
import type { Contact, ContactFieldDef } from "@/lib/types";

type NamedItem = { id: string; name: string };

type SortDir = "asc" | "desc";

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" className={active ? "text-brass-deep" : "text-ink-soft/40"}>
      {dir === "asc" ? <path d="M5 2l4 5H1z" /> : <path d="M5 8L1 3h8z" />}
    </svg>
  );
}

function sortValue(c: Contact, key: string): string {
  if (key === "full_name") return `${c.last_name} ${c.first_name}`;
  const value = (c as unknown as Record<string, unknown>)[key];
  if (Array.isArray(value)) return value.join(", ");
  return value == null ? "" : String(value);
}

export default function ContactsTable({
  contacts,
  fields,
  editable,
  compact,
  contactBalances = {},
  donationCategories,
  donationHandlers,
  defaultHub,
  defaultCurrency,
}: {
  contacts: Contact[];
  fields: ContactFieldDef[];
  editable: boolean;
  compact: boolean;
  contactBalances?: Record<string, number>;
  donationCategories: NamedItem[];
  donationHandlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return contacts;
    const copy = [...contacts];
    copy.sort((a, b) => {
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [contacts, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortableHeader({ label, sortField }: { label: string; sortField: string }) {
    const active = sortKey === sortField;
    return (
      <button
        type="button"
        onClick={() => handleSort(sortField)}
        className="inline-flex items-center gap-1 hover:text-ink transition"
      >
        {label}
        <SortArrow active={active} dir={active ? sortDir : "asc"} />
      </button>
    );
  }

  const pad = compact ? "p-1.5" : "p-2.5";

  return (
    <div className="bg-white border border-line rounded-xl shadow overflow-auto max-h-[70vh]">
      <table className={`w-full ${compact ? "text-xs" : "text-sm"}`}>
        <thead className="sticky top-0 z-10 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
          <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
            <th className={`${pad} bg-white rounded-tr-xl`}>
              <SortableHeader label="שם מלא" sortField="full_name" />
            </th>
            <th className={`${pad} bg-white`}>
              <SortableHeader label="טלפון" sortField="phone" />
            </th>
            {fields.map((f) => (
              <th key={f.key} className={`${pad} bg-white`}>
                <SortableHeader label={f.label} sortField={f.key} />
              </th>
            ))}
            <th className={`${pad} bg-white rounded-tl-xl`}>פעולות</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length > 0 ? (
            sorted.map((c) => (
              <ContactRow
                key={c.id}
                c={c}
                editable={editable}
                fields={fields}
                compact={compact}
                balance={contactBalances[c.id] ?? 0}
                donationCategories={donationCategories}
                donationHandlers={donationHandlers}
                defaultHub={defaultHub}
                defaultCurrency={defaultCurrency}
              />
            ))
          ) : (
            <tr>
              <td colSpan={3 + fields.length} className="text-center text-ink-soft p-8">
                לא נמצאו אנשי קשר תואמים
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
