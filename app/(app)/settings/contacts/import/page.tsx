"use client";

import { useRef, useState } from "react";
import ImportContactsModal from "@/components/ImportContactsModal";

function CloudUploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-400"
    >
      <path d="M7 18a4 4 0 0 1-1-7.86 5 5 0 0 1 9.8-1.98A4.5 4.5 0 0 1 17 18H7z" />
      <path d="M12 12v7" />
      <path d="M9 15l3-3 3 3" />
    </svg>
  );
}

export default function ImportContactsPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  return (
    <div>
      <h2 className="font-serif text-lg font-bold mb-1">ייבוא אנשי קשר</h2>
      <p className="text-sm text-ink-soft mb-4">העלה קובץ אקסל או CSV כדי לעדכן או להוסיף אנשי קשר בבת אחת.</p>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition ${
          isDragging ? "border-brass bg-parchment" : "border-line bg-white hover:bg-parchment/50"
        }`}
      >
        <CloudUploadIcon />
        <p className="text-sm text-ink-soft">
          לחץ כאן לבחירת קובץ מהמחשב (Excel .xlsx / .xls או CSV) או גרור ושחרר קובץ לכאן
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) setFile(picked);
        }}
        className="hidden"
      />

      <label className="flex items-center gap-2 text-sm text-ink-soft mt-4">
        <input type="checkbox" checked={hasHeaderRow} onChange={(e) => setHasHeaderRow(e.target.checked)} />
        שורה 1 היא כותרת (Header)
      </label>

      {file && <ImportContactsModal file={file} hasHeaderRow={hasHeaderRow} onClose={() => setFile(null)} />}
    </div>
  );
}
