"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type ExportResult = { ok: boolean; rows?: Record<string, unknown>[]; error?: string };

export default function ExportButton({
  buttonLabel = "ייצוא לאקסל",
  filename,
  sheetName = "נתונים",
  onExport,
}: {
  buttonLabel?: string;
  filename: string;
  sheetName?: string;
  onExport: () => Promise<ExportResult>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    const res = await onExport();
    setLoading(false);
    if (!res.ok || !res.rows) {
      setError(res.error || "שגיאה בייצוא הנתונים");
      return;
    }
    if (res.rows.length === 0) {
      setError("אין נתונים לייצוא");
      return;
    }
    const sheet = XLSX.utils.json_to_sheet(res.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="text-xs border border-line rounded-full px-3 py-1.5 bg-white hover:bg-parchment transition disabled:opacity-50"
      >
        {loading ? "מייצא..." : buttonLabel}
      </button>
      {error && <span className="text-xs text-wine">{error}</span>}
    </div>
  );
}
