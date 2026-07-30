"use client";

import { useState } from "react";
import PledgeDetailModal from "./PledgeDetailModal";
import DonationDetailModal from "./DonationDetailModal";
import CombinedDetailModal from "./CombinedDetailModal";
import PhoneCallButton from "./PhoneCallButton";
import { describeHebrewDate, parseLocalISODate } from "@/lib/hebrewDate";
import { PAYMENT_HUB_COLORS, type UnifiedDonationRow } from "@/lib/types";

type NamedItem = { id: string; name: string };

const RECORD_TYPE_LABELS: Record<UnifiedDonationRow["recordType"], string> = {
  pledge: "התחייבות",
  payment: "תשלום",
  combined: "התחייבות ותשלום",
};

function formatGregorianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatExtraValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

export default function DonationRow({
  row,
  categories,
  handlers,
  editable,
  columns,
  showGregorianDate,
  showHebrewDate,
  defaultCurrency,
}: {
  row: UnifiedDonationRow;
  categories: NamedItem[];
  handlers: NamedItem[];
  editable: boolean;
  columns: readonly string[];
  showGregorianDate: boolean;
  showHebrewDate: boolean;
  defaultCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  function renderCell(key: string) {
    if (key.startsWith("contact_")) {
      const field = key.slice("contact_".length);
      return (
        <td key={key} className="p-3 whitespace-nowrap">
          {formatExtraValue(row.contactExtra?.[field])}
        </td>
      );
    }

    switch (key) {
      case "date":
        return (
          <td key={key} className="px-2.5 py-1.5 whitespace-nowrap">
            <div className="flex flex-col items-center leading-tight">
              {showGregorianDate && <span>{formatGregorianDate(row.date)}</span>}
              {showHebrewDate && (
                <span className="text-[11px] text-ink-soft">{describeHebrewDate(parseLocalISODate(row.date)).hebrewDate}</span>
              )}
            </div>
          </td>
        );
      case "name":
        return (
          <td key={key} className="p-3 font-semibold whitespace-nowrap">
            <div className="grid grid-cols-[24px_1fr] items-center gap-1.5">
              <PhoneCallButton phone={row.contactPhone} />
              <div className="text-center">{row.contactName}</div>
            </div>
          </td>
        );
      case "debit":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.debitAmount != null ? (
              <>
                {row.debitCurrency}
                {Number(row.debitAmount).toLocaleString("he-IL")}
              </>
            ) : (
              "—"
            )}
          </td>
        );
      case "credit":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.creditAmount != null ? (
              <>
                {row.creditCurrency}
                {Number(row.creditAmount).toLocaleString("he-IL")}
              </>
            ) : (
              "—"
            )}
          </td>
        );
      case "city":
        return (
          <td key={key} className="py-3 pr-5 pl-2.5 whitespace-nowrap">
            {row.contactCity || "—"}
          </td>
        );
      case "payment_method":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.paymentMethod || "—"}
          </td>
        );
      case "handler":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.handler || "—"}
          </td>
        );
      case "category":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.category || "—"}
          </td>
        );
      case "payment_hub":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.paymentHub ? (
              <span className={`pill ${PAYMENT_HUB_COLORS[row.paymentHub] ?? "bg-parchment-deep text-ink-soft"}`}>
                {row.paymentHub}
              </span>
            ) : (
              "—"
            )}
          </td>
        );
      case "status":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.status || "—"}
          </td>
        );
      case "notes":
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            {row.notes || "—"}
          </td>
        );
      default:
        return (
          <td key={key} className="p-3 whitespace-nowrap">
            —
          </td>
        );
    }
  }

  return (
    <>
      <tr
        onClick={() => editable && setOpen(true)}
        className={`border-b border-[#e6e3da] hover:bg-parchment/50 transition ${editable ? "cursor-pointer" : ""}`}
      >
        <td className="py-3 px-1.5">
          <span className={`pill pill-${row.recordType === "payment" ? "paid" : "pending"} text-[11px]`}>
            {RECORD_TYPE_LABELS[row.recordType]}
          </span>
        </td>
        {columns.map((key) => renderCell(key))}
      </tr>

      {open && row.recordType === "pledge" && row.pledge && row.contact && (
        <PledgeDetailModal
          pledge={row.pledge}
          contact={row.contact}
          categories={categories}
          handlers={handlers}
          onClose={() => setOpen(false)}
        />
      )}
      {open && row.recordType === "payment" && row.donation && row.contact && (
        <DonationDetailModal
          donation={row.donation}
          contact={row.contact}
          categories={categories}
          onClose={() => setOpen(false)}
        />
      )}
      {open && row.recordType === "combined" && row.pledge && row.donation && row.contact && (
        <CombinedDetailModal
          pledge={row.pledge}
          donation={row.donation}
          contact={row.contact}
          categories={categories}
          handlers={handlers}
          defaultCurrency={defaultCurrency}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
