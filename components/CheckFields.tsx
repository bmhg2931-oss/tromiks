"use client";

import Field from "./FormField";
import { ISRAEL_BANKS } from "@/lib/banks";

export type CheckValue = {
  checkNumber: string;
  bankName: string;
  branchNumber: string;
  accountNumber: string;
  checkDate: string;
  paymentDate: string;
};

export default function CheckFields({
  value,
  onChange,
  showPaymentDate = true,
  bare = false,
}: {
  value: CheckValue;
  onChange: (value: CheckValue) => void;
  showPaymentDate?: boolean;
  bare?: boolean;
}) {
  return (
    <div className={bare ? "space-y-3" : "border border-line rounded-lg p-3 space-y-3 bg-parchment/40"}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מספר שיק">
          <input
            type="text"
            inputMode="numeric"
            value={value.checkNumber}
            onChange={(e) => onChange({ ...value, checkNumber: e.target.value })}
            className="in"
          />
        </Field>
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
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מספר סניף">
          <input
            type="text"
            inputMode="numeric"
            value={value.branchNumber}
            onChange={(e) => onChange({ ...value, branchNumber: e.target.value })}
            className="in"
          />
        </Field>
        <Field label="מספר חשבון">
          <input
            type="text"
            inputMode="numeric"
            value={value.accountNumber}
            onChange={(e) => onChange({ ...value, accountNumber: e.target.value })}
            className="in"
          />
        </Field>
      </div>
      <div className={showPaymentDate ? "grid grid-cols-2 gap-3" : ""}>
        <Field label="תאריך הצ'ק">
          <input
            type="date"
            value={value.checkDate}
            onChange={(e) => e.target.value && onChange({ ...value, checkDate: e.target.value })}
            className="in"
          />
        </Field>
        {showPaymentDate && (
          <Field label="תאריך תשלום">
            <input
              type="date"
              value={value.paymentDate}
              onChange={(e) => e.target.value && onChange({ ...value, paymentDate: e.target.value })}
              className="in"
            />
          </Field>
        )}
      </div>
    </div>
  );
}
