"use client";

import { useEffect, useRef, useState } from "react";
import { generateContactReportHtml, generateContactReportPdf } from "@/app/(app)/contacts/report-actions";
import { logReportPrint } from "@/app/(app)/contacts/activity-log-actions";
import SendReportEmailModal from "./SendReportEmailModal";
import { DownloadIcon, EmailIcon } from "./icons";

export default function ContactReportModal({
  contactId,
  contactName,
  title = "דו״ח מסכם",
  onClose,
  inline = false,
}: {
  contactId: string;
  contactName: string;
  title?: string;
  onClose?: () => void;
  inline?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showNotesBox, setShowNotesBox] = useState(false);
  const [docNotes, setDocNotes] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function loadPreview(notes: string) {
    generateContactReportHtml(contactId, title, notes).then((res) => {
      if (!res.ok) {
        setError(res.error ?? "שגיאה ביצירת המסמך");
        return;
      }
      setHtml(res.html ?? null);
    });
  }

  useEffect(() => {
    loadPreview("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, title]);

  function handlePrint() {
    void logReportPrint(contactId, title);
    iframeRef.current?.contentWindow?.print();
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    const res = await generateContactReportPdf(contactId, title, docNotes);
    setDownloading(false);
    if (!res.ok || !res.pdfBase64) {
      setError(res.error ?? "שגיאה בהפקת PDF");
      return;
    }
    const bytes = atob(res.pdfBase64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    const blob = new Blob([buffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${res.fileBaseName || contactName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const content = (
    <div
      className={
        inline
          ? "bg-white border border-line rounded-xl h-[70vh] flex flex-col overflow-hidden"
          : "bg-white rounded-2xl shadow-xl border border-line/60 max-w-3xl w-full h-[85vh] flex flex-col overflow-hidden"
      }
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
        <h3 className="font-serif text-lg font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNotesBox((s) => !s)}
            className="text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-parchment"
          >
            הערות למסמך
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!html}
            className="text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-parchment disabled:opacity-40"
          >
            הדפסה
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!html || downloading}
            className="flex items-center gap-1 text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-parchment disabled:opacity-40"
          >
            <DownloadIcon /> {downloading ? "מפיק PDF..." : "הורדה"}
          </button>
          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            disabled={!html}
            className="flex items-center gap-1 text-xs border border-line rounded-lg px-3 py-1.5 hover:bg-parchment disabled:opacity-40"
          >
            <EmailIcon /> שליחה למייל
          </button>
          {!inline && onClose && (
            <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none px-2">
              ×
            </button>
          )}
        </div>
      </div>

      {showNotesBox && (
        <div className="px-5 py-2.5 border-b border-line bg-parchment/40 flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={docNotes}
            onChange={(e) => setDocNotes(e.target.value)}
            onBlur={() => loadPreview(docNotes)}
            placeholder="הערות שיוצגו במסמך הזה בלבד (לא נשמר בכרטיס איש הקשר)"
            className="in flex-1 text-sm"
          />
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {error && <p className="text-sm text-wine p-5">{error}</p>}
        {!error && !html && <p className="text-sm text-ink-soft p-5">מפיק מסמך...</p>}
        {html && <iframe ref={iframeRef} srcDoc={html} className="w-full h-full border-0" title={title} />}
      </div>

      {showSendModal && (
        <SendReportEmailModal contactId={contactId} title={title} docNotes={docNotes} onClose={() => setShowSendModal(false)} />
      )}
    </div>
  );

  if (inline) return content;
  return <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">{content}</div>;
}
