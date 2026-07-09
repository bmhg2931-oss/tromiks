"use client";

import { useMemo, useState, useTransition } from "react";
import { upsertMapping, setDimensionScore } from "@/app/(app)/campaigns/mapping-actions";
import CampaignContactPanel from "./CampaignContactPanel";
import { CAMPAIGN_MAPPING_STATUSES } from "@/lib/types";

export type MappingContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  tags: string[];
  openBalanceILS: number;
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
  contacts,
  dimensions,
}: {
  campaignId: string;
  contacts: MappingContactRow[];
  dimensions: DimensionWithLevels[];
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

  function saveFields(contactId: string, target_amount: number | null, potential_amount: number | null, status: string) {
    const fd = new FormData();
    if (target_amount != null) fd.set("target_amount", String(target_amount));
    if (potential_amount != null) fd.set("potential_amount", String(potential_amount));
    fd.set("status", status);
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
              <th className="p-2.5 bg-white">סטטוס</th>
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
                    {c.phone} · יתרה פתוחה: {money(c.openBalanceILS)}
                    {c.tags.length > 0 && ` · ${c.tags.join(", ")}`}
                  </div>
                </td>
                <td className="p-2.5">
                  <input
                    type="number"
                    defaultValue={c.target_amount ?? ""}
                    onBlur={(e) => saveFields(c.id, e.target.value ? Number(e.target.value) : null, c.potential_amount, c.status)}
                    className="in w-24"
                  />
                </td>
                <td className="p-2.5">
                  <input
                    type="number"
                    defaultValue={c.potential_amount ?? ""}
                    onBlur={(e) => saveFields(c.id, c.target_amount, e.target.value ? Number(e.target.value) : null, c.status)}
                    className="in w-24"
                  />
                </td>
                <td className="p-2.5">
                  <select
                    defaultValue={c.status}
                    onChange={(e) => saveFields(c.id, c.target_amount, c.potential_amount, e.target.value)}
                    className="in w-28"
                  >
                    {CAMPAIGN_MAPPING_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
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
                    שיחות והערות
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openContact && (
        <CampaignContactPanel
          campaignId={campaignId}
          contactId={openContact.id}
          contactName={`${openContact.first_name} ${openContact.last_name}`}
          initialNotes={openContact.notes}
          onClose={() => setOpenContactId(null)}
        />
      )}
    </div>
  );
}
