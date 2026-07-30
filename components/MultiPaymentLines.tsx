"use client";

import { useEffect, useRef, useState } from "react";
import { ISRAEL_BANKS } from "@/lib/banks";
import { toLocalISODate } from "@/lib/hebrewDate";
import { PlusIcon, TrashIcon, ScanIcon, EyeIcon } from "./icons";
import { extractCheckDetails } from "@/app/(app)/donations/check-scan-actions";
import { uploadContactFile, getContactFileUrl } from "@/app/(app)/contacts/files-actions";

export type PaymentLine = {
  id: string;
  amount: string;
  bankName: string;
  branchNumber: string;
  accountNumber: string;
  checkNumber: string;
  checkDate: string;
  filePath?: string;
};

export function newPaymentLine(): PaymentLine {
  return {
    id: crypto.randomUUID(),
    amount: "",
    bankName: "",
    branchNumber: "",
    accountNumber: "",
    checkNumber: "",
    checkDate: toLocalISODate(new Date()),
  };
}

const compactInput = "border border-line rounded-md px-1.5 py-1 text-xs bg-white w-full h-8";

const EXT_BY_MEDIA_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export default function MultiPaymentLines({
  lines,
  onChange,
  onAddLine,
  mode,
  contactId,
}: {
  lines: PaymentLine[];
  onChange: (lines: PaymentLine[]) => void;
  onAddLine: () => void;
  mode: "check" | "bank";
  contactId?: string;
}) {
  // Set/Map (לא ערך בודד) כי בהעלאה מרובה כמה שורות נסרקות/נכשלות בו-זמנית
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [scanErrors, setScanErrors] = useState<Map<string, string>>(new Map());
  const bulkInputRef = useRef<HTMLInputElement>(null);
  // מוחזק ב-ref (ולא רק ב-closure של lines) כי בהעלאה מרובה כמה סריקות רצות במקביל
  // ומתעדכנות בזמנים שונים - סגירה על lines מרגע ה-render היה גורם לעדכונים לדרוס זה
  // את זה ולאבד מידע (bug קלאסי של stale closure מול עדכוני state א-סינכרוניים)
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  function updateLine(id: string, patch: Partial<PaymentLine>) {
    const next = linesRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l));
    linesRef.current = next;
    onChange(next);
  }

  function removeLine(id: string) {
    const next = linesRef.current.filter((l) => l.id !== id);
    linesRef.current = next;
    onChange(next);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // שומר את קובץ השיק הסרוק/שהועלה בתיקיית הקבצים של איש הקשר, ומחזיר את נתיב האחסון
  // שלו - נשמר על השורה עצמה (filePath) כדי שכפתור "צפייה" יעבוד גם אחרי שמירה
  // ופתיחה מחדש של הרשומה, לא רק באותה עריכה
  async function archiveCheckFile(mediaType: string, checkNumber: string | undefined, file: File): Promise<string | null> {
    if (!contactId) return null;
    const ext = EXT_BY_MEDIA_TYPE[mediaType] || file.name.split(".").pop() || "bin";
    const label = checkNumber ? `שיק ${checkNumber}` : "שיק סרוק";
    const fileName = `${label} - ${toLocalISODate(new Date())}.${ext}`;
    const fd = new FormData();
    fd.set("file", file, fileName);
    fd.set("original_name", fileName);
    const res = await uploadContactFile(contactId, fd);
    return res.ok && res.file ? res.file.storage_path : null;
  }

  async function processScannedFile(id: string, file: File) {
    setScanErrors((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    setScanningIds((s) => new Set(s).add(id));
    try {
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const base64 = await fileToBase64(file);
        const result = await extractCheckDetails(base64, file.type);
        if (result.ok) {
          updateLine(id, {
            ...(result.bankName ? { bankName: result.bankName } : {}),
            ...(result.branchNumber ? { branchNumber: result.branchNumber } : {}),
            ...(result.accountNumber ? { accountNumber: result.accountNumber } : {}),
            ...(result.checkNumber ? { checkNumber: result.checkNumber } : {}),
            ...(result.checkDate ? { checkDate: result.checkDate } : {}),
            ...(result.amount ? { amount: result.amount } : {}),
          });
          const path = await archiveCheckFile(file.type, result.checkNumber, file);
          if (path) updateLine(id, { filePath: path });
          return;
        }
        setScanErrors((m) => new Map(m).set(id, result.error));
      } else {
        // קובץ שאינו תמונה (למשל PDF) - לא ניתן לפענח אוטומטית, רק מארכבים ומאפשרים מילוי ידני
        setScanErrors((m) => new Map(m).set(id, "לא ניתן לפענח אוטומטית קובץ מסוג זה - יש למלא את הפרטים ידנית"));
      }
      const path = await archiveCheckFile(file.type, undefined, file);
      if (path) updateLine(id, { filePath: path });
    } catch (e) {
      setScanErrors((m) => new Map(m).set(id, e instanceof Error ? e.message : "שגיאה בעיבוד הקובץ"));
    } finally {
      setScanningIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  // מאפשר לבחור כמה קבצי שיק בבת אחת (תמונות סרוקות או PDF) - לכל קובץ שנבחר: אם
  // קיימת שורה ריקה שעדיין לא מולאה (כמו שורת ברירת המחדל שנוצרת כשעוברים לאמצעי
  // תשלום "צ'ק") היא תמולא ראשונה, ורק אם לא נותרו שורות ריקות תיווצר שורה חדשה
  function isEmptyLine(l: PaymentLine): boolean {
    return !l.filePath && !l.amount && !l.bankName && !l.branchNumber && !l.accountNumber && !l.checkNumber;
  }

  async function handleBulkUpload(files: File[]) {
    if (files.length === 0) return;
    const emptyLines = linesRef.current.filter(isEmptyLine);
    const createdLines: PaymentLine[] = [];
    const targetLines = files.map((_, i) => {
      if (i < emptyLines.length) return emptyLines[i];
      const nl = newPaymentLine();
      createdLines.push(nl);
      return nl;
    });
    const next = [...linesRef.current, ...createdLines];
    linesRef.current = next;
    onChange(next);
    await Promise.all(files.map((file, i) => processScannedFile(targetLines[i].id, file)));
  }

  async function handleViewFile(path: string | undefined) {
    if (!path) return;
    const res = await getContactFileUrl(path, false);
    if (res.ok && res.url) window.open(res.url, "_blank");
  }

  const itemLabel = mode === "check" ? "שיק" : "העברה";
  const bankSelect = (line: PaymentLine) => (
    <select value={line.bankName} onChange={(e) => updateLine(line.id, { bankName: e.target.value })} className={compactInput}>
      <option value="">בחר בנק...</option>
      {ISRAEL_BANKS.map((b) => (
        <option key={b.code} value={b.name}>
          {b.name} ({b.code})
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-2">
      {mode === "check" && (
        <div className="flex justify-end">
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            ref={bulkInputRef}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              handleBulkUpload(files);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => bulkInputRef.current?.click()}
            title="העלאת שיקים סרוקים (ניתן לבחור כמה קבצים, כולל PDF)"
            className="text-ink-soft hover:text-ink hover:bg-parchment-deep rounded-md w-5 h-5 flex items-center justify-center transition"
          >
            <ScanIcon />
          </button>
        </div>
      )}

      {lines.map((line, idx) => (
        <div key={line.id} className="border border-line rounded-lg p-2 space-y-1.5 bg-parchment/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink-soft">
              {itemLabel} {idx + 1}
            </span>
            <div className="flex items-center gap-1">
              {mode === "check" && line.filePath && (
                <button
                  type="button"
                  onClick={() => handleViewFile(line.filePath)}
                  title="צפייה בשיק שהועלה"
                  className="text-ink-soft hover:text-ink hover:bg-parchment-deep rounded-md w-5 h-5 flex items-center justify-center transition"
                >
                  <EyeIcon />
                </button>
              )}
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  aria-label={`הסרת ${itemLabel} ${idx + 1}`}
                  className="text-wine hover:bg-wine hover:text-white rounded-md w-5 h-5 flex items-center justify-center transition"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </div>
          {scanningIds.has(line.id) && <p className="text-[10px] text-ink-soft">מעבד את הקובץ...</p>}
          {scanErrors.has(line.id) && <p className="text-[10px] text-wine">{scanErrors.get(line.id)}</p>}

          {mode === "check" ? (
            <div className="grid grid-cols-6 gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                placeholder="מספר שיק"
                value={line.checkNumber}
                onChange={(e) => updateLine(line.id, { checkNumber: e.target.value })}
                className={compactInput}
              />
              {bankSelect(line)}
              <input
                type="text"
                inputMode="numeric"
                placeholder="מספר סניף"
                value={line.branchNumber}
                onChange={(e) => updateLine(line.id, { branchNumber: e.target.value })}
                className={compactInput}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="מספר חשבון"
                value={line.accountNumber}
                onChange={(e) => updateLine(line.id, { accountNumber: e.target.value })}
                className={compactInput}
              />
              <input
                type="date"
                value={line.checkDate}
                onChange={(e) => e.target.value && updateLine(line.id, { checkDate: e.target.value })}
                className={compactInput}
              />
              <input
                type="number"
                min="1"
                step="0.01"
                placeholder="סכום"
                value={line.amount}
                onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                className={compactInput}
              />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {bankSelect(line)}
              <input
                type="text"
                inputMode="numeric"
                placeholder="מספר סניף"
                value={line.branchNumber}
                onChange={(e) => updateLine(line.id, { branchNumber: e.target.value })}
                className={compactInput}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="מספר חשבון"
                value={line.accountNumber}
                onChange={(e) => updateLine(line.id, { accountNumber: e.target.value })}
                className={compactInput}
              />
              <input
                type="number"
                min="1"
                step="0.01"
                placeholder="סכום"
                value={line.amount}
                onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                className={compactInput}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAddLine}
          aria-label={`הוספת ${itemLabel}`}
          className="w-8 h-8 shrink-0 rounded-full bg-brass hover:bg-brass-deep text-white flex items-center justify-center transition"
        >
          <PlusIcon />
        </button>
        <span className="text-xs text-ink-soft">הוספת {itemLabel} נוסף{mode === "check" ? "" : "ת"}</span>
      </div>
    </div>
  );
}
