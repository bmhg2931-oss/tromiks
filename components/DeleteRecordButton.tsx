"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { softDeleteRecord, type TrashTable } from "@/app/(app)/settings/trash/actions";
import { TrashIcon } from "./icons";

export default function DeleteRecordButton({
  table,
  id,
  label,
  onDeleted,
}: {
  table: TrashTable;
  id: string;
  label: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`למחוק את ${label}? ניתן לשחזר בכל עת מתוך הגדרות > פריטים שנמחקו.`)) return;
    setDeleting(true);
    const result = await softDeleteRecord(table, id);
    setDeleting(false);
    if (!result.ok) {
      alert(result.error ?? "שגיאה במחיקה");
      return;
    }
    router.refresh();
    onDeleted?.();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="flex items-center gap-1.5 text-xs text-wine border border-wine/40 rounded-full px-3 py-1.5 hover:bg-wine hover:text-white transition disabled:opacity-50"
    >
      <TrashIcon />
      {deleting ? "מוחק..." : "מחיקה"}
    </button>
  );
}
