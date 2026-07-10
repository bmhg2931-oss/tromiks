"use client";

import { useMemo, useState, useTransition } from "react";
import { upsertMapping, setDimensionScore } from "@/app/(app)/campaigns/mapping-actions";
import CampaignContactPanel from "./CampaignContactPanel";
import type { CampaignRecordRow } from "./CampaignRecordsTable";
import type { Contact } from "@/lib/types";

type NamedItem = { id: string; name: string };

export type MappingContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  tags: string[];
  fullContact: Contact;
  referenceLabel: string;
  referenceAmountILS: number;
  target_amount: number | null;
  potential_amount: number | null;
  status: string;
  notes: string;
  scores: Record<string, string>; // dimensionId -> levelId
};

export type DimensionWithLevels = {
  id: string;
  name: string;
  levels: { id: string; label: string }[];
};

function money(amount: number) {
  return `₪${Math.round(amount).toLocaleString("he-IL")}`;
}

export default function CampaignMappingTable({
  campaignId,
  campaignName,
  contacts,
  dimensions,
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
  contacts: MappingContactRow[];
  dimensions: DimensionWithLevels[];
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
  const [rows, setRows] = useState(contacts);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return rows;
    return rows.filter((c) => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return words.every((w) => name.includes(w) || c.phone.includes(w));
    });
  }, [rows, q]);

  function updateLocal(contactId: string, patch: Partial<MappingContactRow>) {
    setRows((prev) => prev.map((r) => (r.id === contactId ? { ...r, ...patch } : r)));
  }

  function saveFields(contactId: string, target_amount: number | null, potential_amount: number | null) {
    const fd = new FormData();
    if (target_amount != null) fd.set("target_amount", String(target_amount));
    if (potential_amount != null) fd.set("potential_amount", String(potential_amount));
    fd.set("status", rows.find((r) => r.id === contactId)?.status ?? "טרם טופל");
    startTransition(async () => {
      await upsertMapping(campaignId, contactId, fd);
    });
  }

  function saveScore(contactId: string, dimensionId: string, levelId: string) {
    updateLocal(contactId, { scores: { ...(rows.find((r) => r.id === contactId)?.scores ?? {}), [dimensionId]: levelId } });
    startTransition(async () => {
      await setDimensionScore(campaignId, contactId, dimensionId, levelId);
    });
  }

  const openContact = rows.find((r) => r.id === openContactId);
  const openContactRecords = openContact ? records.filter((r) => r.contactId === openContact.id) : [];
  const openContactSummary = openContact
    ? [
        { label: "יעד", value: openContact.target_amount != null ? money(openContact.target_amount) : "—" },
        { label: "פוטנציאל", value: openContact.potential_amount != null ? money(openContact.potential_amount) : "—" },
        ...dimensions
          .filter((d) => openContact.scores[d.id])
          .map((d) => ({ label: d.name, value: d.levels.find((l) => l.id === openContact.scores[d.id])?.label ?? "" })),
      ]
    : [];

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
              <th className="p-2.5 bg-white">יעד גיוס</th>
              <th className="p-2.5 bg-white">פוטנציאל</th>
              {dimensions.map((d) => (
                <th key={d.id} className="p-2.5 bg-white whitespace-nowrap">
                  {d.name}
                </th>
              ))}
              <th className="p-2.5 bg-white"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-[#e6e3da]">
                <td className="p-2.5 whitespace-nowrap">
                  <div className="font-semibold">
                    {c.first_name} {c.last_name}
                  </div>
                  <div className="text-[11px] text-ink-soft">
                    {c.phone} · {c.referenceLabel}: {money(c.referenceAmountILS)}
                    {c.tags.length > 0 && ` · ${c.tags.join(", ")}`}
                  </div>
                </td>
                <td className="p-2.5">
                  <input
                    type="number"
                    defaultValue={c.target_amount ?? ""}
                    onBlur={(e) => saveFields(c.id, e.target.value ? Number(e.target.value) : null, c.potential_amount)}
                    className="in w-24"
                  />
                </td>
                <td className="p-2.5">
                  <input
                    type="number"
                    defaultValue={c.potential_amount ?? ""}
                    onBlur={(e) => saveFields(c.id, c.target_amount, e.target.value ? Number(e.target.value) : null)}
                    className="in w-24"
                  />
                </td>
                {dimensions.map((d) => (
                  <td key={d.id} className="p-2.5">
                    <select
                      defaultValue={c.scores[d.id] ?? ""}
                      onChange={(e) => e.target.value && saveScore(c.id, d.id, e.target.value)}
                      className="in w-28"
                    >
                      <option value="">—</option>
                      {d.levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="p-2.5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setOpenContactId(c.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-line hover:bg-parchment transition"
                  >
                    היסטוריית התרמה
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openContact && (
        <CampaignContactPanel
          key={openContact.id}
          campaignId={campaignId}
          campaignName={campaignName}
          contactId={openContact.id}
          contactName={`${openContact.first_name} ${openContact.last_name}`}
          contactPhone={openContact.phone}
          contactEmail={openContact.fullContact.email}
          contactDepartment={openContact.fullContact.department}
          contactTags={openContact.tags}
          editable={editable}
          initialNotes={openContact.notes}
          showNotesEditor
          mappingSummary={openContactSummary}
          records={openContactRecords}
          donationProps={{ contact: openContact.fullContact, categories, handlers, defaultHub, defaultCurrency, defaultCategory: campaignCategoryName ?? undefined }}
          emailTemplate={emailTemplate}
          faxTemplate={faxTemplate}
          switchOptions={rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` }))}
          onSwitchContact={(id) => setOpenContactId(id)}
          onClose={() => setOpenContactId(null)}
        />
      )}
    </div>
  );
}
