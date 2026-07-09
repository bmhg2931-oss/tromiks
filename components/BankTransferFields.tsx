"use client";

import Field from "./FormField";
import { ISRAEL_BANKS } from "@/lib/banks";

export type BankTransferValue = {
  bankName: string;
  branchNumber: string;
  accountNumber: string;
  transferDate: string;
};

export default function BankTransferFields({
  value,
  onChange,
  showDate = true,
  bare = false,
}: {
  value: BankTransferValue;
  onChange: (value: BankTransferValue) => void;
  showDate?: boolean;
  bare?: boolean;
}) {
  return (
    <div className={bare ? "space-y-3" : "border border-line rounded-lg p-3 space-y-3 bg-parchment/40"}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="בנק">
          <select
            value={value.bankName}
            onChange={(e) => onChange({ ...value, bankName: e.target.value })}
            className="in"
          >
            <option value="">בחר בנק...</option>
            {ISRAEL_BANKS.map((b) => (
              <option key={b.code} value={b.name}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="מספר סניף">
          <input
            type="text"
            inputMode="numeric"
            value={value.branchNumber}
            onChange={(e) => onChange({ ...value, branchNumber: e.target.value })}
            className="in"
          />
        </Field>
      </div>
      <Field label="מספר חשבון">
        <input
          type="text"
          inputMode="numeric"
          value={value.accountNumber}
          onChange={(e) => onChange({ ...value, accountNumber: e.target.value })}
          className="in"
        />
      </Field>
      {showDate && (
        <Field label="תאריך ביצוע ההעברה">
          <input
            type="date"
            value={value.transferDate}
            onChange={(e) => e.target.value && onChange({ ...value, transferDate: e.target.value })}
            className="in"
          />
        </Field>
      )}
    </div>
  );
}
