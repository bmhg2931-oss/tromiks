"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import CurrencySelect from "./CurrencySelect";
import HebrewDateHint from "./HebrewDateHint";
import BankTransferFields, { type BankTransferValue } from "./BankTransferFields";
import CheckFields, { type CheckValue } from "./CheckFields";
import Field from "./FormField";
import SaveButton from "./SaveButton";
import PaymentMethodIcon from "./PaymentMethodIcon";
import type { DonationFormResult } from "@/app/(app)/donations/actions";
import { PAY_METHODS, type Donation } from "@/lib/types";
import { toLocalISODate } from "@/lib/hebrewDate";

type NamedItem = { id: string; name: string };

export default function DonationForm({
  action,
  initial,
  contactName,
  onDirty,
  onPendingChange,
  onSuccess,
  categories,
}: {
  action: (prevState: DonationFormResult | null, formData: FormData) => Promise<DonationFormResult>;
  initial: Donation;
  contactName: string;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  categories: NamedItem[];
}) {
  const [state, formAction] = useFormState(action, null);
  const [currency, setCurrency] = useState(initial.currency || "₪");
  const [amount, setAmount] = useState(String(initial.amount ?? ""));
  const [date, setDate] = useState(initial.donation_date || toLocalISODate(new Date()));
  const [paymentMethod, setPaymentMethod] = useState(initial.payment_method || "מזומן");
  const [bankTransfer, setBankTransfer] = useState<BankTransferValue>({
    bankName: initial.bank_name || "",
    branchNumber: initial.branch_number || "",
    accountNumber: initial.account_number || "",
    transferDate: date,
  });
  const [check, setCheck] = useState<CheckValue>({
    checkNumber: initial.check_number || "",
    bankName: initial.bank_name || "",
    branchNumber: initial.branch_number || "",
    accountNumber: initial.account_number || "",
    checkDate: initial.check_date || date,
    paymentDate: date,
  });

  useEffect(() => {
    if (state?.ok) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isCheck = paymentMethod === "צ'ק";
  const isBankTransfer = paymentMethod === "העברה בנקאית";

  return (
    <form action={formAction} onChange={() => onDirty()} className="space-y-4">
      <Field label="תורם">
        <div className="in bg-parchment/60">{contactName}</div>
      </Field>

      <Field label="קטגוריה *">
        <select name="purpose" required defaultValue={initial.purpose} className="in">
          {initial.purpose && !categories.some((c) => c.name === initial.purpose) && (
            <option value={initial.purpose}>{initial.purpose}</option>
          )}
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 items-start">
        <label className="block text-xs font-semibold text-ink-soft">סכום</label>
        <label className="block text-xs font-semibold text-ink-soft">תאריך</label>

        <CurrencySelect name="currency" value={currency} onChange={setCurrency} />
        <div />

        <input
          type="number"
          name="amount"
          min="1"
          step="0.01"
          required
          placeholder="סכום *"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="in h-11"
        />
        <input
          type="date"
          name="donation_date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="in h-11"
        />

        <div />
        <HebrewDateHint dateStr={date} attached />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1">אמצעי תשלום *</label>
        <div className="grid grid-cols-5 gap-2">
          {PAY_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`flex flex-col items-center justify-center gap-1.5 px-1.5 py-3 rounded-lg text-xs font-bold border transition ${
                paymentMethod === m ? "bg-brass text-white border-brass" : "border-line bg-white hover:bg-parchment text-ink"
              }`}
            >
              <PaymentMethodIcon method={m} size={20} />
              <span className="text-center leading-tight">{m}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="payment_method" value={paymentMethod} />
      </div>

      {isBankTransfer && (
        <BankTransferFields value={bankTransfer} onChange={setBankTransfer} showDate={false} />
      )}
      {isBankTransfer && (
        <>
          <input type="hidden" name="bank_name" value={bankTransfer.bankName} />
          <input type="hidden" name="branch_number" value={bankTransfer.branchNumber} />
          <input type="hidden" name="account_number" value={bankTransfer.accountNumber} />
        </>
      )}

      {isCheck && <CheckFields value={check} onChange={setCheck} showPaymentDate={false} />}
      {isCheck && (
        <>
          <input type="hidden" name="check_number" value={check.checkNumber} />
          <input type="hidden" name="bank_name" value={check.bankName} />
          <input type="hidden" name="branch_number" value={check.branchNumber} />
          <input type="hidden" name="account_number" value={check.accountNumber} />
          <input type="hidden" name="check_date" value={check.checkDate} />
        </>
      )}

      <Field label="הערות">
        <textarea name="notes" defaultValue={initial.notes ?? ""} className="in min-h-[50px]" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך המשך טיפול (אופציונלי)">
          <input type="date" name="follow_up" defaultValue={initial.follow_up ?? ""} className="in" />
        </Field>
        <Field label="פרטי המשך טיפול">
          <input type="text" name="follow_up_details" defaultValue={initial.follow_up_details ?? ""} className="in" />
        </Field>
      </div>

      {state?.error && <p className="text-sm text-wine text-center">{state.error}</p>}

      <div className="flex justify-center pt-2">
        <SaveButton onPendingChange={onPendingChange} />
      </div>
    </form>
  );
}
