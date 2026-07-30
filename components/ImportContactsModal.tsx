"use client";

import { useEffect, useState } from "react";
import { parseContactsFile, importContactsBatch, type ImportErrorLogEntry } from "@/app/(app)/settings/import-actions";
import { IMPORT_FIELD_OPTIONS } from "@/lib/contactImportFields";

type Step = "loading" | "select-sheet" | "mapping" | "select-fields" | "importing" | "done";

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
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

const CHUNK_SIZE = 25;

export default function ImportContactsModal({
  file,
  hasHeaderRow,
  onClose,
}: {
  file: File;
  hasHeaderRow: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [hadSheetSelection, setHadSheetSelection] = useState(false);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [selectedHeaders, setSelectedHeaders] = useState<Set<string>>(new Set());

  const [tagsMode, setTagsMode] = useState<"append" | "overwrite">("append");

  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; errors: number } | null>(null);
  const [errorLog, setErrorLog] = useState<ImportErrorLogEntry[]>([]);

  async function parse(sheetName?: string) {
    setParsing(true);
    setParseError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("hasHeaderRow", String(hasHeaderRow));
      if (sheetName) fd.append("sheetName", sheetName);
      const result = await parseContactsFile(fd);
      if (result.needsSheetSelection) {
        setSheetNames(result.sheetNames);
        setSelectedSheet(result.sheetNames[0]);
        setHadSheetSelection(true);
        setStep("select-sheet");
        return;
      }
      setHeaders(result.headers);
      setRows(result.rows);
      setMapping(result.guessedMapping);
      setStep("mapping");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "אירעה שגיאה בעיבוד הקובץ");
    } finally {
      setParsing(false);
    }
  }

  useEffect(() => {
    parse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirmSheet() {
    parse(selectedSheet);
  }

  function handleContinueFromMapping() {
    const mappedFields = new Set(Object.values(mapping));
    const missing: string[] = [];
    if (!mappedFields.has("phone")) missing.push('סלולארי ראשי (מזהה)');
    if (!mappedFields.has("last_name")) missing.push("שם משפחה");
    if (missing.length > 0) {
      setMappingError(`יש למפות עמודה לכל אחד מהשדות הבאים: ${missing.join(", ")}`);
      return;
    }
    setMappingError(null);
    const importable = headers.filter((h) => mapping[h] !== "skip" && mapping[h] !== "phone");
    setSelectedHeaders(new Set(importable));
    setStep("select-fields");
  }

  function handleBack() {
    if (step === "select-sheet") {
      onClose();
    } else if (step === "mapping") {
      if (hadSheetSelection) {
        setMappingError(null);
        setStep("select-sheet");
      } else {
        onClose();
      }
    } else if (step === "select-fields") {
      setStep("mapping");
    }
  }

  function toggleHeader(h: string) {
    setSelectedHeaders((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }

  async function runImport() {
    setStep("importing");
    setProgress(0);
    const fieldsToUpdate = Array.from(new Set(Array.from(selectedHeaders).map((h) => mapping[h])));
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const fullLog: ImportErrorLogEntry[] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const result = await importContactsBatch(chunk, mapping, fieldsToUpdate, i, tagsMode);
      inserted += result.inserted;
      updated += result.updated;
      errors += result.errors;
      fullLog.push(...result.errorLog);
      setProgress(Math.round(((i + chunk.length) / rows.length) * 100));
    }
    setImportResult({ inserted, updated, errors });
    setErrorLog(fullLog);
    setStep("done");
  }

  const closeDisabled = step === "importing";
  const dotSteps: Step[] = hadSheetSelection
    ? ["select-sheet", "mapping", "select-fields", "importing"]
    : ["mapping", "select-fields", "importing"];
  const showBack = step === "select-sheet" || step === "mapping" || step === "select-fields";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {showBack && (
              <button
                onClick={handleBack}
                aria-label="חזרה לשלב הקודם"
                className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center hover:bg-ink/85 transition"
              >
                <BackArrowIcon />
              </button>
            )}
            <h2 className="font-serif text-xl font-bold">ייבוא אנשי קשר</h2>
          </div>
          <button
            onClick={() => !closeDisabled && onClose()}
            disabled={closeDisabled}
            aria-label="סגירה"
            className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment disabled:opacity-30"
          >
            ×
          </button>
        </div>

        {step !== "loading" && <StepDots steps={dotSteps} current={step} />}

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            {parseError ? (
              <>
                <p className="text-sm text-wine text-center max-w-sm">{parseError}</p>
                <button
                  onClick={onClose}
                  className="mt-2 border border-line rounded-full px-6 py-2 text-sm hover:bg-parchment transition"
                >
                  סגור
                </button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 border-2 border-brass border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-ink-soft">מעלה ומנתח קובץ...</p>
              </>
            )}
          </div>
        )}

        {step === "select-sheet" && (
          <div>
            <p className="text-sm text-ink-soft mb-4">בקובץ שנבחר יש מספר גיליונות. איזה גיליון תרצה לייבא?</p>
            <select
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="w-full border border-line rounded-lg px-2.5 py-2 text-sm bg-white mb-4"
            >
              {sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {parseError && <p className="text-sm text-wine mb-3">{parseError}</p>}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleConfirmSheet}
                disabled={parsing}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-8 py-2.5 text-sm transition disabled:opacity-60"
              >
                {parsing ? "טוען..." : "המשך"}
              </button>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div>
            <p className="text-sm text-ink-soft mb-4">
              זיהינו את הכותרות הבאות בקובץ. התאם כל עמודה לשדה המתאים בטופס איש קשר.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {headers.map((h) => (
                <div key={h}>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">{h}</label>
                  <select
                    value={mapping[h] ?? "skip"}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setMapping((prev) => {
                        const next = { ...prev, [h]: newValue };
                        if (newValue === "phone") {
                          // עמודת המזהה חייבת להיות ייחודית - עמודה אחרת שהייתה ממופה אליה חוזרת ל"דלג"
                          for (const key of Object.keys(next)) {
                            if (key !== h && next[key] === "phone") next[key] = "skip";
                          }
                        }
                        return next;
                      });
                    }}
                    className="w-full border border-line rounded-lg px-2.5 py-2 text-sm bg-white"
                  >
                    {IMPORT_FIELD_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {mappingError && <p className="text-sm text-wine mb-3">{mappingError}</p>}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleContinueFromMapping}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-8 py-2.5 text-sm transition"
              >
                המשך
              </button>
            </div>
          </div>
        )}

        {step === "select-fields" && (
          <div>
            <h3 className="font-serif text-base font-bold mb-3">אילו עמודות ברצונך לעדכן?</h3>
            <p className="text-xs text-ink-soft mb-3">
              איש קשר חדש (שלא נמצא לפי המזהה) מחייב שיהיה לו שם משפחה כלשהו, גם אם לא נבחר כאן לעדכון.
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {headers
                .filter((h) => mapping[h] !== "skip" && mapping[h] !== "phone")
                .map((h) => {
                  const label = IMPORT_FIELD_OPTIONS.find((o) => o.key === mapping[h])?.label ?? mapping[h];
                  const selected = selectedHeaders.has(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHeader(h)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition ${
                        selected ? "bg-brass text-white border-brass" : "bg-white text-ink-soft border-line hover:bg-parchment"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
            </div>

            {headers.some((h) => mapping[h] === "tags" && selectedHeaders.has(h)) && (
              <div className="mb-4 text-sm bg-parchment border border-line rounded-lg p-3">
                <p className="font-semibold text-ink-soft mb-2">התנהגות עדכון תגיות:</p>
                <label className="flex items-center gap-2 mb-1">
                  <input
                    type="radio"
                    name="tagsMode"
                    checked={tagsMode === "overwrite"}
                    onChange={() => setTagsMode("overwrite")}
                  />
                  דריסת תגיות קיימות
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tagsMode"
                    checked={tagsMode === "append"}
                    onChange={() => setTagsMode("append")}
                  />
                  הוספת תגיות לתגיות קיימות
                </label>
              </div>
            )}

            {(() => {
              const activeHeaders = headers.filter((h) => mapping[h] !== "skip" && mapping[h] !== "phone" && selectedHeaders.has(h));
              const activeLabels = activeHeaders.map((h) => IMPORT_FIELD_OPTIONS.find((o) => o.key === mapping[h])?.label ?? mapping[h]);
              return (
                <div className="bg-parchment border border-line rounded-lg p-3 mb-4 text-sm">
                  <span className="font-semibold text-ink-soft">השדות שיעודכנו בפועל: </span>
                  {activeLabels.length > 0 ? activeLabels.join(", ") : "— אף שדה, חוץ ממזהה —"}
                </div>
              );
            })()}

            <div className="flex justify-center pt-2">
              <button
                onClick={runImport}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-8 py-2.5 text-sm transition"
              >
                אישור ועדכן אנשי קשר
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-6 text-center">
            <p className="text-sm text-ink-soft mb-4">מעדכן אנשי קשר... ({progress}%)</p>
            <div className="w-full bg-parchment-deep rounded-full h-3 overflow-hidden">
              <div className="bg-brass h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-2 text-center space-y-3">
            <p className="font-serif text-lg font-bold text-sage">העדכון הושלם בהצלחה</p>
            {importResult && (
              <p className="text-sm text-ink-soft">
                {importResult.updated} אנשי קשר עודכנו · {importResult.inserted} אנשי קשר חדשים נוספו
                {importResult.errors > 0 && ` · ${importResult.errors} אנשי קשר נכשלו`}
              </p>
            )}

            {errorLog.length > 0 && (
              <div className="text-right border border-line rounded-xl overflow-hidden mt-4">
                <div className="bg-parchment px-3 py-2 text-xs font-semibold text-ink-soft">שורות שנשמטו</div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-xs text-ink-soft border-b border-line">
                        <th className="p-2 w-20">שורה</th>
                        <th className="p-2">סיבה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorLog.map((entry, i) => (
                        <tr key={i} className="border-b border-[#e6e3da]">
                          <td className="p-2">{entry.row}</td>
                          <td className="p-2 text-wine">{entry.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-center pt-2">
              <button
                onClick={onClose}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-8 py-2.5 text-sm transition"
              >
                אישור
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
