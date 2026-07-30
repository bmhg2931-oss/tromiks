"use client";

import { useMemo, useState } from "react";
import DonationRow from "./DonationRow";
import { DONATION_COLUMN_LABELS, type UnifiedDonationRow } from "@/lib/types";

type NamedItem = { id: string; name: string };
type SortDir = "asc" | "desc";

const RECORD_TYPE_LABELS: Record<UnifiedDonationRow["recordType"], string> = {
  pledge: "התחייבות",
  payment: "תשלום",
  combined: "התחייבות ותשלום",
};

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" className={active ? "text-brass-deep" : "text-ink-soft/40"}>
      {dir === "asc" ? <path d="M5 2l4 5H1z" /> : <path d="M5 8L1 3h8z" />}
    </svg>
  );
}

function sortValue(r: UnifiedDonationRow, key: string): string | number {
  switch (key) {
    case "recordType":
      return RECORD_TYPE_LABELS[r.recordType];
    case "date":
      return r.date;
    case "name":
      return r.contactName;
    case "city":
      return r.contactCity ?? "";
    case "debit":
      return r.debitAmount ?? -Infinity;
    case "credit":
      return r.creditAmount ?? -Infinity;
    case "payment_hub":
      return r.paymentHub ?? "";
    case "payment_method":
      return r.paymentMethod ?? "";
    case "status":
      return r.status ?? "";
    case "notes":
      return r.notes ?? "";
    case "handler":
      return r.handler ?? "";
    case "category":
      return r.category ?? "";
    default:
      if (key.startsWith("contact_")) {
        const value = r.contactExtra?.[key.slice("contact_".length)];
        if (Array.isArray(value)) return value.join(", ");
        return value == null ? "" : String(value);
      }
      return "";
  }
}

function compareRows(a: UnifiedDonationRow, b: UnifiedDonationRow, key: string): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "he");
}

export default function DonationsTable({
  rows,
  categories,
  handlers,
  editable,
  columns,
  showGregorianDate,
  showHebrewDate,
  defaultCurrency,
}: {
  rows: UnifiedDonationRow[];
  categories: NamedItem[];
  handlers: NamedItem[];
  editable: boolean;
  columns: readonly string[];
  showGregorianDate: boolean;
  showHebrewDate: boolean;
  defaultCurrency: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

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

  return (
    <div className="bg-white border border-line rounded-xl shadow overflow-auto max-h-[70vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
          <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
            <th className="py-2.5 px-1.5 bg-white rounded-tr-xl">
              <SortableHeader label="סוג רשומה" sortField="recordType" />
            </th>
            {columns.map((key, i) => (
              <th
                key={key}
                className={`p-2.5 bg-white ${key === "date" || key === "name" ? "text-center" : ""} ${key === "city" ? "pr-5" : ""} ${i === columns.length - 1 ? "rounded-tl-xl" : ""}`}
              >
                <SortableHeader label={DONATION_COLUMN_LABELS[key]} sortField={key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length > 0 ? (
            sorted.map((r) => (
              <DonationRow
                key={`${r.recordType}-${r.id}`}
                row={r}
                categories={categories}
                handlers={handlers}
                editable={editable}
                columns={columns}
                showGregorianDate={showGregorianDate}
                showHebrewDate={showHebrewDate}
                defaultCurrency={defaultCurrency}
              />
            ))
          ) : (
            <tr>
              <td colSpan={1 + columns.length} className="text-center text-ink-soft p-8">
                לא נמצאו רשומות תואמות
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
