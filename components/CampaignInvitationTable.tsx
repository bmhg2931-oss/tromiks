"use client";

import { useMemo, useState, useTransition } from "react";
import { setInvitationStatus, markInvited } from "@/app/(app)/campaigns/invitation-actions";
import { CAMPAIGN_INVITATION_STATUSES } from "@/lib/types";
import { stripLeadingZeros } from "@/lib/validation";

export type InvitationContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
};

function whatsappLink(phone: string, message: string) {
  const digits = stripLeadingZeros(phone.replace(/[^\d]/g, ""));
  return `https://wa.me/972${digits}?text=${encodeURIComponent(message)}`;
}

export default function CampaignInvitationTable({
  campaignId,
  campaignName,
  contacts,
}: {
  campaignId: string;
  campaignName: string;
  contacts: InvitationContactRow[];
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(contacts);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return rows;
    return rows.filter((c) => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return words.every((w) => name.includes(w) || c.phone.includes(w));
    });
  }, [rows, q]);

  function updateLocal(contactId: string, status: string) {
    setRows((prev) => prev.map((r) => (r.id === contactId ? { ...r, status } : r)));
  }

  function handleStatusChange(contactId: string, status: string) {
    updateLocal(contactId, status);
    startTransition(async () => {
      await setInvitationStatus(campaignId, contactId, status);
    });
  }

  function handleSendInvite(contactId: string, phone: string, name: string) {
    const message = `שלום ${name}, מוזמנים להצטרף אלינו לקמפיין "${campaignName}"!`;
    window.open(whatsappLink(phone, message), "_blank");
    updateLocal(contactId, "הוזמן");
    startTransition(async () => {
      await markInvited(campaignId, contactId);
    });
  }

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
              <th className="p-2.5 bg-white">סטטוס</th>
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
                  <div className="text-[11px] text-ink-soft">{c.phone}</div>
                </td>
                <td className="p-2.5">
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value)}
                    className="in w-28"
                  >
                    {CAMPAIGN_INVITATION_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2.5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSendInvite(c.id, c.phone, `${c.first_name} ${c.last_name}`.trim())}
                    disabled={!c.phone}
                    className="text-xs px-2.5 py-1 rounded-lg bg-brass hover:bg-brass-deep text-white transition disabled:opacity-40"
                  >
                    שליחת הזמנה בוואטסאפ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
