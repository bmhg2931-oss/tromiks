"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type ImportResult = { ok: boolean; inserted?: number; error?: string };

const HEADER_WORDS = new Set(["שם", "עיר", "ארץ", "name", "city", "country"]);

export default function BulkImportModal({
  buttonLabel,
  title,
  instructions,
  columnCount,
  onImport,
}: {
  buttonLabel: string;
  title: string;
  instructions: string;
  columnCount: 1 | 2;
  onImport: (rows: string[][]) => Promise<ImportResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const cleaned = raw
        .map((r) => r.map((c) => String(c ?? "").trim()).slice(0, columnCount))
        .filter((r) => r.some(Boolean))
        .filter((r, i) => !(i === 0 && HEADER_WORDS.has(r[0].toLowerCase())));
      setRows(cleaned);
    };
    reader.readAsBinaryString(file);
  }

  async function handleImport() {
    setImporting(true);
    const res = await onImport(rows);
    setImporting(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  function closeModal() {
    setOpen(false);
    setRows([]);
    setFileName("");
    setResult(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs border border-line rounded-full px-3 py-1.5 bg-white hover:bg-parchment transition"
      >
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold">{title}</h2>
              <button
                onClick={closeModal}
                aria-label="סגירה"
                className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-ink-soft mb-4">{instructions}</p>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="text-xs mb-3"
            />

            {fileName && rows.length > 0 && (
              <p className="text-xs text-sage mb-3">
                נמצאו {rows.length} שורות תקינות בקובץ &quot;{fileName}&quot;.
              </p>
            )}
            {fileName && rows.length === 0 && <p className="text-xs text-wine mb-3">לא נמצאו שורות תקינות בקובץ.</p>}

            {result && !result.ok && <p className="text-xs text-wine mb-3">{result.error}</p>}
            {result?.ok && <p className="text-xs text-sage mb-3">יובאו {result.inserted} רשומות בהצלחה.</p>}

            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="text-sm border border-line rounded-full px-4 py-2 hover:bg-parchment transition">
                סגירה
              </button>
              <button
                onClick={handleImport}
                disabled={rows.length === 0 || importing}
                className="text-sm bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 py-2 transition disabled:opacity-50"
              >
                {importing ? "מייבא..." : `ייבוא (${rows.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
