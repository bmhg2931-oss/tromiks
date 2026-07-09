"use client";

import { useRef, useState } from "react";
import {
  uploadContactFile,
  getContactFileUrl,
  deleteContactFile,
  type ContactFileRow,
} from "@/app/(app)/contacts/files-actions";
import { PaperclipIcon, UploadIcon, DownloadIcon, EyeIcon, TrashIcon } from "./icons";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContactFilesTab({
  contactId,
  editable,
  files,
  error,
  onChanged,
}: {
  contactId: string;
  editable: boolean;
  files: ContactFileRow[] | null;
  error: string | null;
  onChanged: () => void;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; file: ContactFileRow } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLocalError(null);
    const formData = new FormData();
    formData.set("file", file);
    const res = await uploadContactFile(contactId, formData);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) setLocalError(res.error ?? "שגיאה בהעלאת הקובץ");
    else onChanged();
  }

  async function handlePreview(f: ContactFileRow) {
    const res = await getContactFileUrl(f.storage_path, false);
    if (res.ok && res.url) setPreview({ url: res.url, file: f });
    else setLocalError(res.error ?? "שגיאה בפתיחת הקובץ");
  }

  async function handleDownload(f: ContactFileRow) {
    const res = await getContactFileUrl(f.storage_path, true);
    if (res.ok && res.url) window.open(res.url, "_blank");
    else setLocalError(res.error ?? "שגיאה בהורדת הקובץ");
  }

  async function handleDelete(id: string) {
    setPendingId(id);
    const res = await deleteContactFile(id);
    setPendingId(null);
    if (!res.ok) setLocalError(res.error ?? "שגיאה במחיקת הקובץ");
    else onChanged();
  }

  return (
    <div className="space-y-4">
      {editable && (
        <div>
          <label className="inline-flex items-center gap-2 text-sm bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 py-2 transition cursor-pointer">
            <UploadIcon />
            {uploading ? "מעלה..." : "העלאת קובץ"}
            <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>
      )}

      {(error || localError) && <p className="text-sm text-wine">{error || localError}</p>}

      {!files ? (
        <p className="text-sm text-ink-soft">טוען קבצים...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-ink-soft">אין קבצים מצורפים עדיין</p>
      ) : (
        <div className="bg-white border border-line rounded-xl divide-y divide-line/60">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <PaperclipIcon />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{f.file_name}</div>
                <div className="text-xs text-ink-soft">
                  {new Date(f.uploaded_at).toLocaleDateString("he-IL")}
                  {f.size_bytes ? ` · ${formatBytes(f.size_bytes)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePreview(f)}
                title="תצוגה מקדימה"
                aria-label="תצוגה מקדימה"
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-parchment hover:text-ink transition"
              >
                <EyeIcon />
              </button>
              <button
                type="button"
                onClick={() => handleDownload(f)}
                title="הורדה"
                aria-label="הורדה"
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-parchment hover:text-ink transition"
              >
                <DownloadIcon />
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => handleDelete(f.id)}
                  disabled={pendingId === f.id}
                  title="מחיקה"
                  aria-label="מחיקה"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-wine hover:bg-wine/10 transition disabled:opacity-50"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full h-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-line shrink-0">
              <span className="text-sm font-semibold truncate">{preview.file.file_name}</span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="סגירה"
                className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment"
              >
                ×
              </button>
            </div>
            <div className="flex-1 bg-parchment/40 overflow-hidden">
              {preview.file.content_type?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={preview.file.file_name} className="w-full h-full object-contain" />
              ) : (
                <iframe src={preview.url} title={preview.file.file_name} className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
