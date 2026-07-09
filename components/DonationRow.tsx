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
  even,
}: {
  row: UnifiedDonationRow;
  categories: NamedItem[];
  handlers: NamedItem[];
  editable: boolean;
  columns: readonly string[];
  showGregorianDate: boolean;
  showHebrewDate: boolean;
  even: boolean;
}) {
  const [open, setOpen] = useState(false);

  const rowBg = even ? "bg-sage/10" : "bg-black/[0.035]";
  const nameBg = even ? "bg-sage/[0.13]" : "bg-black/[0.045]";
  const rowHoverBg = even ? "hover:bg-sage/20" : "hover:bg-black/[0.06]";

  function renderCell(key: string) {
    if (key.startsWith("contact_")) {
      const field = key.slice("contact_".length);
      return (
        <td key={key} className="p-2.5 whitespace-nowrap">
          {formatExtraValue(row.contactExtra?.[field])}
        </td>
      );
    }

    switch (key) {
      case "date":
        return (
          <td key={key} className="px-2.5 py-1 whitespace-nowrap">
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
          <td key={key} className={`p-2.5 font-semibold whitespace-nowrap ${nameBg}`}>
            <div className="relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <PhoneCallButton phone={row.contactPhone} />
              </div>
              <div className="text-center">{row.contactName}</div>
            </div>
          </td>
        );
      case "debit":
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
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
          <td key={key} className="p-2.5 whitespace-nowrap">
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
          <td key={key} className="py-2.5 pr-5 pl-2.5 whitespace-nowrap">
            {row.contactCity || "—"}
          </td>
        );
      case "payment_method":
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
            {row.paymentMethod || "—"}
          </td>
        );
      case "handler":
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
            {row.handler || "—"}
          </td>
        );
      case "category":
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
            {row.category || "—"}
          </td>
        );
      case "payment_hub":
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
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
          <td key={key} className="p-2.5 whitespace-nowrap">
            {row.status || "—"}
          </td>
        );
      case "notes":
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
            {row.notes || "—"}
          </td>
        );
      default:
        return (
          <td key={key} className="p-2.5 whitespace-nowrap">
            —
          </td>
        );
    }
  }

  return (
    <>
      <tr
        onClick={() => editable && setOpen(true)}
        className={`border-b border-[#e6e3da] transition ${rowBg} ${editable ? `cursor-pointer ${rowHoverBg}` : ""}`}
      >
        <td className="py-2.5 px-1.5">
          <span className={`pill pill-${row.recordType === "payment" ? "paid" : "pending"} text-[11px]`}>
            {RECORD_TYPE_LABELS[row.recordType]}
          </span>
        </td>
        {columns.map((key) => renderCell(key))}
      </tr>

      {open && row.recordType === "pledge" && row.pledge && (
        <PledgeDetailModal
          pledge={row.pledge}
          contactName={row.contactName}
          categories={categories}
          handlers={handlers}
          onClose={() => setOpen(false)}
        />
      )}
      {open && row.recordType === "payment" && row.donation && (
        <DonationDetailModal
          donation={row.donation}
          contactName={row.contactName}
          categories={categories}
          onClose={() => setOpen(false)}
        />
      )}
      {open && row.recordType === "combined" && row.pledge && row.donation && (
        <CombinedDetailModal
          pledge={row.pledge}
          donation={row.donation}
          contactName={row.contactName}
          categories={categories}
          handlers={handlers}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
