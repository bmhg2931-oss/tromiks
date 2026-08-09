"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseDonationsFile,
  createImportBatch,
  saveImportRows,
  commitImportRows,
  type ParsedDonationRow,
  type CommitRowError,
} from "@/app/(app)/donations/mapping-actions";
import { DONATION_IMPORT_FIELD_OPTIONS } from "@/lib/donationImportFields";
import DonationImportRowCard, { DonationImportRowCardHeader } from "./DonationImportRowCard";
import {
  ALL_CURRENCIES,
  RECORD_TYPE_LABELS,
  availableRecordTypes,
  type DonationImportRow,
  type DonationImportSource,
  type DonationRecordType,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type Step = "pick-file" | "select-sheet" | "mapping" | "preview" | "importing" | "done";

function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n !== 0 ? n : n === 0 ? 0 : null;
}

// תומך ב-DD/MM/YYYY, DD-MM-YYYY, ו-YYYY-MM-DD (הפורמט הנפוץ בקבצי אקסל/CSV שמיוצאים
// בישראל) - מחזיר null אם אין התאמה, כדי שהמשתמש יתקן ידנית בתצוגה המקדימה
function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

const SIMPLE_TEXT_FIELDS = [
  "category",
  "payment_hub",
  "pledge_type",
  "handler",
  "status",
  "bank_name",
  "branch_number",
  "account_number",
  "check_number",
] as const;

function buildWorkingRows(
  headers: string[],
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  defaultRecordType: DonationRecordType
): ParsedDonationRow[] {
  const findHeader = (field: string) => Object.entries(mapping).find(([, f]) => f === field)?.[0];
  const dateHeader = findHeader("donation_date");
  const amountHeader = findHeader("amount");
  const nameHeader = findHeader("donor_name");
  const phoneHeader = findHeader("phone");
  const paymentHeader = findHeader("payment_method_raw");
  const currencyHeader = findHeader("currency");
  const notesHeader = findHeader("notes");
  const checkDateHeader = findHeader("check_date");
  const simpleHeaders = Object.fromEntries(SIMPLE_TEXT_FIELDS.map((f) => [f, findHeader(f)]));

  return rows.map((row) => ({
    raw: row,
    donor_name: nameHeader ? row[nameHeader] || null : null,
    phone: phoneHeader ? row[phoneHeader] || null : null,
    amount: amountHeader ? parseAmount(row[amountHeader]) : null,
    currency: currencyHeader && (ALL_CURRENCIES as string[]).includes(row[currencyHeader]) ? row[currencyHeader] : "₪",
    donation_date: dateHeader ? parseDate(row[dateHeader]) : null,
    payment_method_raw: paymentHeader ? row[paymentHeader] || null : null,
    record_type: defaultRecordType,
    check_date: checkDateHeader ? parseDate(row[checkDateHeader]) : null,
    notes: notesHeader ? row[notesHeader] || null : null,
    ...Object.fromEntries(SIMPLE_TEXT_FIELDS.map((f) => [f, simpleHeaders[f] ? row[simpleHeaders[f]!] || null : null])),
  })) as ParsedDonationRow[];
}

function StepDots({ steps, current }: { steps: Step[]; current: Step }) {
  const index = steps.indexOf(current === "done" ? "importing" : current);
  return (
    <div className="flex items-center justify-center gap-1.5 mb-4">
      {steps.map((s, i) => (
        <span key={s} className={`w-2 h-2 rounded-full ${i === index ? "bg-brass" : "bg-line"}`} />
      ))}
    </div>
  );
}

export default function DonationImportModal({
  source,
  onClose,
  onDone,
}: {
  source: DonationImportSource;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("pick-file");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [hadSheetSelection, setHadSheetSelection] = useState(false);

  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [defaultRecordType, setDefaultRecordType] = useState<DonationRecordType>("payment_only");

  const [previewRows, setPreviewRows] = useState<DonationImportRow[]>([]);
  const [commitResult, setCommitResult] = useState<{ succeeded: string[]; failed: CommitRowError[] } | null>(null);

  async function runParse(sheetName?: string) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("hasHeaderRow", String(hasHeaderRow));
      if (sheetName) fd.append("sheetName", sheetName);
      const result = await parseDonationsFile(fd);
      if (result.needsSheetSelection) {
        setSheetNames(result.sheetNames);
        setSelectedSheet(result.sheetNames[0]);
        setHadSheetSelection(true);
        setStep("select-sheet");
        return;
      }
      setHeaders(result.headers);
      setParsedRows(result.rows);
      setMapping(result.guessedMapping);
      setStep("mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "אירעה שגיאה בעיבוד הקובץ");
    } finally {
      setBusy(false);
    }
  }

  // רק "סכום" חוסם לגמרי - בלעדיו אף שורה לא יכולה להפוך לתרומה/התחייבות בפועל
  // (createDonation/createPledge דוחים סכום ריק). "טלפון" לא חוסם בכוונה: קובץ
  // בלי עמודת טלפון בכלל (או עם ערכים חסרים בחלק מהשורות) עדיין עולה לתצוגה
  // המקדימה - השורות פשוט יסומנו "טרם שויך" ויחייבו שיוך ידני לפי שם, בדיוק כמו
  // שורה עם טלפון שלא נמצאה לו התאמה
  function handleContinueFromMapping() {
    const mapped = new Set(Object.values(mapping));
    if (!mapped.has("amount")) {
      setMappingError("יש למפות עמודה לשדה סכום - בלי זה לא ניתן ליצור תרומה/התחייבות מאף שורה");
      return;
    }
    setMappingError(null);
    void runSaveAndMatch();
  }

  async function runSaveAndMatch() {
    setBusy(true);
    setError(null);
    setStep("importing");
    try {
      const batchResult = await createImportBatch(source, file?.name ?? null);
      if (!batchResult.ok || !batchResult.batchId) throw new Error(batchResult.error ?? "שגיאה ביצירת הייבוא");

      const workingRows = buildWorkingRows(headers, parsedRows, mapping, defaultRecordType);
      const saveResult = await saveImportRows(batchResult.batchId, workingRows);
      if (!saveResult.ok || !saveResult.rowIds) throw new Error(saveResult.error ?? "שגיאה בשמירת השורות");

      const supabase = createClient();
      const { data } = await supabase
        .from("donation_import_rows")
        .select("*, contacts:matched_contact_id(first_name, last_name)")
        .in("id", saveResult.rowIds);
      setPreviewRows((data as unknown as DonationImportRow[]) ?? []);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "אירעה שגיאה");
      setStep("mapping");
    } finally {
      setBusy(false);
    }
  }

  function patchRow(rowId: string, patch: Partial<DonationImportRow>) {
    setPreviewRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  async function refreshRow(rowId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("donation_import_rows")
      .select("*, contacts:matched_contact_id(first_name, last_name)")
      .eq("id", rowId)
      .single();
    if (data) patchRow(rowId, data as unknown as DonationImportRow);
  }

  async function handleCommit() {
    const rowIds = previewRows.filter((r) => r.match_status !== "skipped" && r.match_status !== "imported").map((r) => r.id);
    if (rowIds.length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    setStep("importing");
    const result = await commitImportRows(rowIds);
    setCommitResult(result);
    setBusy(false);
    setStep("done");
  }

  const closeDisabled = busy;
  const dotSteps: Step[] = hadSheetSelection
    ? ["select-sheet", "mapping", "importing"]
    : ["mapping", "importing"];
  const showBack = step === "mapping" && !busy;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-bold">ייבוא תרומות - {source}</h2>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="סגירה"
            className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment disabled:opacity-30"
          >
            ×
          </button>
        </div>

        {step !== "pick-file" && step !== "preview" && step !== "done" && <StepDots steps={dotSteps} current={step} />}
        {error && <div className="text-sm text-wine bg-[#fdf1f1] border border-wine/30 rounded-lg p-2 mb-3">{error}</div>}

        {step === "pick-file" && (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) setFile(dropped);
              }}
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition ${
                isDragging ? "border-brass bg-parchment" : "border-line bg-white hover:bg-parchment/50"
              }`}
            >
              <p className="text-sm text-ink-soft">{file ? file.name : "לחץ לבחירת קובץ (Excel .xlsx/.xls או CSV) או גרור ושחרר לכאן"}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <label className="flex items-center gap-2 text-sm text-ink-soft mt-4">
              <input type="checkbox" checked={hasHeaderRow} onChange={(e) => setHasHeaderRow(e.target.checked)} />
              שורה 1 היא כותרת (Header)
            </label>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                disabled={!file || busy}
                onClick={() => runParse()}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-5 h-9 text-sm transition disabled:opacity-50"
              >
                {busy ? "מעבד..." : "המשך"}
              </button>
            </div>
          </div>
        )}

        {step === "select-sheet" && (
          <div>
            <p className="text-sm text-ink-soft mb-3">הקובץ מכיל כמה גיליונות - בחר/י מאיזה גיליון לייבא:</p>
            <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} className="in w-full">
              {sheetNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex justify-between mt-4">
              <button type="button" onClick={onClose} className="text-sm text-ink-soft underline">
                ביטול
              </button>
              <button
                type="button"
                onClick={() => runParse(selectedSheet)}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-5 h-9 text-sm transition"
              >
                המשך
              </button>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div>
            {mappingError && <div className="text-sm text-wine mb-3">{mappingError}</div>}
            {!Object.values(mapping).includes("phone") && (
              <div className="text-sm text-ink-soft bg-parchment border border-line rounded-lg p-2 mb-3">
                אין עמודת טלפון ממופה - זה בסדר, אפשר להמשיך. כל השורות פשוט יסומנו &quot;טרם שויך&quot; ויצטרכו שיוך ידני לפי שם בתצוגה המקדימה.
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border border-line rounded-lg px-3 py-2 mb-3 bg-parchment/40">
              <label className="text-sm font-semibold">סוג רשומה לכל השורות בקובץ זה</label>
              <select
                value={defaultRecordType}
                onChange={(e) => setDefaultRecordType(e.target.value as DonationRecordType)}
                className="in w-56 text-sm"
              >
                {availableRecordTypes(source).map((rt) => (
                  <option key={rt} value={rt}>
                    {RECORD_TYPE_LABELS[rt]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {headers.map((h) => (
                <div key={h} className="flex items-center justify-between gap-3 border border-line rounded-lg px-3 py-2">
                  <span className="text-sm font-semibold">{h}</span>
                  <select
                    value={mapping[h] ?? "skip"}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                    className="in w-56 text-sm"
                  >
                    {DONATION_IMPORT_FIELD_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4">
              {showBack ? (
                <button
                  type="button"
                  onClick={() => (hadSheetSelection ? setStep("select-sheet") : onClose())}
                  className="text-sm text-ink-soft underline"
                >
                  חזרה
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleContinueFromMapping}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-5 h-9 text-sm transition"
              >
                המשך
              </button>
            </div>
          </div>
        )}

        {step === "importing" && <p className="text-sm text-ink-soft text-center py-8">מעבד...</p>}

        {step === "preview" && (
          <div>
            <p className="text-sm text-ink-soft mb-3">
              {previewRows.length} שורות. יש לשייך כל שורה לפני האישור - שורה ללא שיוך לא תיהפך לתרומה/התחייבות.
            </p>
            <div className="border border-line rounded-xl max-h-[55vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <DonationImportRowCardHeader />
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <DonationImportRowCard
                      key={row.id}
                      row={row}
                      source={source}
                      onChange={(patch) => patchRow(row.id, patch)}
                      onMatched={() => refreshRow(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between mt-4">
              <button type="button" onClick={onClose} className="text-sm text-ink-soft underline">
                סגירה (השורות נשמרו, אפשר להמשיך מאוחר יותר)
              </button>
              <button
                type="button"
                onClick={handleCommit}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-5 h-9 text-sm transition"
              >
                אישור ושמירה
              </button>
            </div>
          </div>
        )}

        {step === "done" && commitResult && (
          <div>
            <p className="text-sm mb-3">
              <span className="text-[#4a6b34] font-semibold">{commitResult.succeeded.length} שורות יובאו בהצלחה.</span>
              {commitResult.failed.length > 0 && <span className="text-wine font-semibold"> {commitResult.failed.length} שורות נכשלו.</span>}
            </p>
            {commitResult.failed.length > 0 && (
              <div className="border border-wine/30 rounded-lg p-2 max-h-56 overflow-y-auto text-sm space-y-1 mb-3">
                {commitResult.failed.map((f) => (
                  <div key={f.rowId} className="text-wine">
                    {f.error}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onDone}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-5 h-9 text-sm transition"
              >
                סגירה
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
