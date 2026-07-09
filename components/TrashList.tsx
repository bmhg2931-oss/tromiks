"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreRecord, type TrashTable } from "@/app/(app)/settings/trash/actions";

export type TrashItem = {
  id: string;
  table: TrashTable;
  typeLabel: string;
  title: string;
  subtitle?: string;
  deletedAt: string;
  deletedByName: string;
  details: Record<string, unknown>;
};

const TYPE_COLORS: Record<TrashTable, string> = {
  contacts: "bg-sage/15 text-sage",
  donations: "bg-[#e7e5dc] text-[#4d5c46]",
  pledges: "bg-[#f3e9d2] text-[#8a6415]",
  donation_categories: "bg-[#e3e6f2] text-[#3a4a8f]",
  donation_handlers: "bg-[#eadcf5] text-[#6b3fa0]",
  contact_cities: "bg-[#f4e1e1] text-[#7a3232]",
  contact_files: "bg-[#dde8ec] text-[#2d5b6b]",
  campaigns: "bg-brass/15 text-brass-deep",
};

function TrashRow({ item }: { item: TrashItem }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleRestore() {
    setRestoring(true);
    const result = await restoreRecord(item.table, item.id);
    setRestoring(false);
    if (!result.ok) {
      alert(result.error ?? "שגיאה בשחזור");
      return;
    }
    router.refresh();
  }

  return (
    <div className="border-b border-line/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-right hover:bg-parchment/50 transition"
      >
        <span className={`pill ${TYPE_COLORS[item.table]} shrink-0`}>{item.typeLabel}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{item.title || "—"}</div>
          {item.subtitle && <div className="text-xs text-ink-soft truncate">{item.subtitle}</div>}
        </div>
        <div className="text-xs text-ink-soft text-left shrink-0">
          <div>נמחק ע&quot;י {item.deletedByName}</div>
          <div>{new Date(item.deletedAt).toLocaleString("he-IL")}</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 flex items-start justify-between gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-xs text-ink-soft space-y-1">
            {Object.entries(item.details).map(([key, value]) => (
              <div key={key}>
                <span className="font-semibold">{key}: </span>
                {value ? String(value) : "—"}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRestore}
            disabled={restoring}
            className="shrink-0 text-xs bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 py-1.5 transition disabled:opacity-50"
          >
            {restoring ? "משחזר..." : "שחזור"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TrashList({ items }: { items: TrashItem[] }) {
  if (items.length === 0) {
    return <div className="bg-white border border-line rounded-xl p-8 text-center text-ink-soft text-sm">אין פריטים שנמחקו</div>;
  }

  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden">
      {items.map((item) => (
        <TrashRow key={`${item.table}-${item.id}`} item={item} />
      ))}
    </div>
  );
}
