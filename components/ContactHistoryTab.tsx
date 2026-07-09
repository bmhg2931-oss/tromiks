"use client";

import { useState } from "react";
import type { ContactHistoryRow } from "@/app/(app)/contacts/history-actions";
import PledgeDetailModal from "./PledgeDetailModal";
import DonationDetailModal from "./DonationDetailModal";
import CombinedDetailModal from "./CombinedDetailModal";

type NamedItem = { id: string; name: string };

const RECORD_TYPE_LABELS: Record<ContactHistoryRow["recordType"], string> = {
  pledge: "התחייבות",
  payment: "תשלום",
  combined: "התחייבות ותשלום",
};

function formatGregorianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return `${currency ?? ""}${Number(amount).toLocaleString("he-IL")}`;
}

export default function ContactHistoryTab({
  rows,
  error,
  editable,
  contactName,
  categories,
  handlers,
  onChanged,
}: {
  rows: ContactHistoryRow[] | null;
  error: string | null;
  editable: boolean;
  contactName: string;
  categories: NamedItem[];
  handlers: NamedItem[];
  onChanged: () => void;
}) {
  const [openRow, setOpenRow] = useState<ContactHistoryRow | null>(null);

  function closeModal() {
    setOpenRow(null);
    onChanged();
  }

  if (error) return <p className="text-sm text-wine">{error}</p>;
  if (!rows) return <p className="text-sm text-ink-soft">טוען היסטוריה...</p>;

  return (
    <>
      <div className="bg-white border border-line rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
              <th className="py-2.5 px-1.5">סוג רשומה</th>
              <th className="p-2.5">תאריך</th>
              <th className="p-2.5">קטגוריה / ייעוד</th>
              <th className="p-2.5">חובה</th>
              <th className="p-2.5">זכות</th>
              <th className="p-2.5">אופן תשלום</th>
              <th className="p-2.5">מטפל</th>
              <th className="p-2.5">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => editable && setOpenRow(r)}
                  className={`border-b border-[#e6e3da] transition ${editable ? "cursor-pointer hover:bg-parchment/50" : ""}`}
                >
                  <td className="py-2.5 px-1.5">
                    <span className={`pill pill-${r.recordType === "payment" ? "paid" : "pending"} text-[11px]`}>
                      {RECORD_TYPE_LABELS[r.recordType]}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">{formatGregorianDate(r.date)}</td>
                  <td className="p-2.5 whitespace-nowrap">{r.category || "—"}</td>
                  <td className="p-2.5 whitespace-nowrap">{money(r.debitAmount, r.debitCurrency)}</td>
                  <td className="p-2.5 whitespace-nowrap">{money(r.creditAmount, r.creditCurrency)}</td>
                  <td className="p-2.5 whitespace-nowrap">{r.paymentMethod || "—"}</td>
                  <td className="p-2.5 whitespace-nowrap">{r.handler || "—"}</td>
                  <td className="p-2.5 whitespace-nowrap">{r.status || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center text-ink-soft p-6">
                  אין תרומות או התחייבויות רשומות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openRow?.recordType === "pledge" && openRow.pledge && (
        <PledgeDetailModal
          pledge={openRow.pledge}
          contactName={contactName}
          categories={categories}
          handlers={handlers}
          onClose={closeModal}
        />
      )}
      {openRow?.recordType === "payment" && openRow.donation && (
        <DonationDetailModal
          donation={openRow.donation}
          contactName={contactName}
          categories={categories}
          onClose={closeModal}
        />
      )}
      {openRow?.recordType === "combined" && openRow.pledge && openRow.donation && (
        <CombinedDetailModal
          pledge={openRow.pledge}
          donation={openRow.donation}
          contactName={contactName}
          categories={categories}
          handlers={handlers}
          onClose={closeModal}
        />
      )}
    </>
  );
}
