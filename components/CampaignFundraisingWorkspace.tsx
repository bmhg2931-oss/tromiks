"use client";

import { useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import CampaignContactPanel from "./CampaignContactPanel";
import type { CampaignRecordRow } from "./CampaignRecordsTable";

type NamedItem = { id: string; name: string };

export type FundraisingContactRow = {
  contact: Contact;
  target_amount: number | null;
  potential_amount: number | null;
  status: string;
  notes: string;
  mappingSummary: { label: string; value: string }[];
};

function money(amount: number | null, currency = "₪") {
  if (amount == null) return "—";
  return `${currency}${Math.round(amount).toLocaleString("he-IL")}`;
}

export default function CampaignFundraisingWorkspace({
  campaignId,
  campaignName,
  contacts,
  records,
  categories,
  handlers,
  defaultHub,
  defaultCurrency,
  campaignCategoryName,
  editable,
  emailTemplate,
  faxTemplate,
}: {
  campaignId: string;
  campaignName: string;
  contacts: FundraisingContactRow[];
  records: CampaignRecordRow[];
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
  campaignCategoryName?: string | null;
  editable: boolean;
  emailTemplate?: string | null;
  faxTemplate?: string | null;
}) {
  const [q, setQ] = useState("");
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return contacts;
    return contacts.filter((row) => {
      const name = `${row.contact.first_name} ${row.contact.last_name}`.toLowerCase();
      return words.every((w) => name.includes(w) || row.contact.phone.includes(w));
    });
  }, [contacts, q]);

  const recordsByContact = useMemo(() => {
    const map = new Map<string, CampaignRecordRow[]>();
    for (const r of records) {
      const list = map.get(r.contactId) ?? [];
      list.push(r);
      map.set(r.contactId, list);
    }
    return map;
  }, [records]);

  const openRow = contacts.find((c) => c.contact.id === openContactId);

  return (
    <div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש לפי שם או טלפון..."
        className="in max-w-sm mb-3"
      />
      <div className="bg-white border border-line rounded-xl shadow overflow-auto max-h-[65vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
            <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
              <th className="p-2.5 bg-white">איש קשר</th>
              <th className="p-2.5 bg-white">יעד</th>
              <th className="p-2.5 bg-white">פוטנציאל</th>
              <th className="p-2.5 bg-white">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.contact.id}
                onClick={() => setOpenContactId(row.contact.id)}
                className="border-b border-[#e6e3da] hover:bg-parchment/50 cursor-pointer transition"
              >
                <td className="p-2.5 whitespace-nowrap">
                  <div className="font-semibold">
                    {row.contact.first_name} {row.contact.last_name}
                  </div>
                  <div className="text-[11px] text-ink-soft">{row.contact.phone}</div>
                </td>
                <td className="p-2.5 whitespace-nowrap">{money(row.target_amount, defaultCurrency)}</td>
                <td className="p-2.5 whitespace-nowrap">{money(row.potential_amount, defaultCurrency)}</td>
                <td className="p-2.5 whitespace-nowrap">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openRow && (
        <CampaignContactPanel
          key={openRow.contact.id}
          campaignId={campaignId}
          campaignName={campaignName}
          contactId={openRow.contact.id}
          contactName={`${openRow.contact.first_name} ${openRow.contact.last_name}`}
          contactPhone={openRow.contact.phone}
          contactEmail={openRow.contact.email}
          contactDepartment={openRow.contact.department}
          contactTags={openRow.contact.tags}
          editable={editable}
          initialNotes={openRow.notes}
          mappingSummary={openRow.mappingSummary}
          records={recordsByContact.get(openRow.contact.id) ?? []}
          donationProps={{ contact: openRow.contact, categories, handlers, defaultHub, defaultCurrency, defaultCategory: campaignCategoryName ?? undefined }}
          emailTemplate={emailTemplate}
          faxTemplate={faxTemplate}
          switchOptions={contacts.map((c) => ({ id: c.contact.id, name: `${c.contact.first_name} ${c.contact.last_name}` }))}
          onSwitchContact={(id) => setOpenContactId(id)}
          onClose={() => setOpenContactId(null)}
        />
      )}
    </div>
  );
}
