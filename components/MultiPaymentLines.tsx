"use client";

import { ISRAEL_BANKS } from "@/lib/banks";
import { toLocalISODate } from "@/lib/hebrewDate";
import { PlusIcon, TrashIcon } from "./icons";

export type PaymentLine = {
  id: string;
  amount: string;
  bankName: string;
  branchNumber: string;
  accountNumber: string;
  checkNumber: string;
  checkDate: string;
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

export default function MultiPaymentLines({
  lines,
  onChange,
  onAddLine,
  mode,
}: {
  lines: PaymentLine[];
  onChange: (lines: PaymentLine[]) => void;
  onAddLine: () => void;
  mode: "check" | "bank";
}) {
  function updateLine(id: string, patch: Partial<PaymentLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    onChange(lines.filter((l) => l.id !== id));
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
      {lines.map((line, idx) => (
        <div key={line.id} className="border border-line rounded-lg p-2 space-y-1.5 bg-parchment/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink-soft">
              {itemLabel} {idx + 1}
            </span>
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
