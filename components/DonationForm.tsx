"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import ContactAutocomplete from "./ContactAutocomplete";
import CategoryCombobox from "./CategoryCombobox";
import CurrencySelect from "./CurrencySelect";
import HebrewDateHint from "./HebrewDateHint";
import MultiPaymentLines, { newPaymentLine, type PaymentLine } from "./MultiPaymentLines";
import Field from "./FormField";
import SaveButton from "./SaveButton";
import PaymentMethodIcon from "./PaymentMethodIcon";
import type { DonationFormResult, DonationPaymentLineRow } from "@/app/(app)/donations/actions";
import { PAYMENT_HUBS, PAY_METHODS, type Donation, type Contact } from "@/lib/types";
import { toLocalISODate } from "@/lib/hebrewDate";

type NamedItem = { id: string; name: string };

const PAYMENT_METHOD_BUTTONS = PAY_METHODS.filter((m) => m !== "הוראת קבע");

function rowsToLines(rows: DonationPaymentLineRow[]): PaymentLine[] {
  return rows.map((r) => ({
    id: r.id,
    amount: String(r.amount),
    bankName: r.bank_name ?? "",
    branchNumber: r.branch_number ?? "",
    accountNumber: r.account_number ?? "",
    checkNumber: r.check_number ?? "",
    checkDate: r.check_date ?? toLocalISODate(new Date()),
    filePath: r.file_storage_path ?? undefined,
  }));
}

// אם אין שורות בטבלת donation_payment_lines (למשל תשלום ישן מלפני שהזרימה המרובה
// נשמרה כטבלה נפרדת), נשתמש בשדות הבודדים ששמורים ישירות על שורת התשלום עצמה כשורה
// יחידה - כדי שגם רשומות ישנות ייערכו באותו ממשק בדיוק, בלי לאבד מידע
function legacySingleLine(initial: Donation): PaymentLine {
  return {
    id: crypto.randomUUID(),
    amount: String(initial.amount ?? ""),
    bankName: initial.bank_name ?? "",
    branchNumber: initial.branch_number ?? "",
    accountNumber: initial.account_number ?? "",
    checkNumber: initial.check_number ?? "",
    checkDate: initial.check_date || toLocalISODate(new Date()),
  };
}

function seedLines(kind: "צ'ק" | "העברה בנקאית", initial: Donation, rows?: DonationPaymentLineRow[]): PaymentLine[] {
  if (initial.payment_method !== kind) return [newPaymentLine()];
  if (rows && rows.length > 0) return rowsToLines(rows);
  if (initial.bank_name || initial.check_number) return [legacySingleLine(initial)];
  return [newPaymentLine()];
}

export default function DonationForm({
  action,
  initial,
  presetContact,
  onDirty,
  onPendingChange,
  onSuccess,
  categories,
  paymentLines,
}: {
  action: (prevState: DonationFormResult | null, formData: FormData) => Promise<DonationFormResult>;
  initial: Donation;
  presetContact: Contact;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  categories: NamedItem[];
  paymentLines?: DonationPaymentLineRow[];
}) {
  const [state, formAction] = useFormState(action, null);
  const [hub, setHub] = useState(initial.payment_hub || PAYMENT_HUBS[0]);
  const [category, setCategory] = useState(initial.purpose ?? "");
  const [currency, setCurrency] = useState(initial.currency || "₪");
  const [amount, setAmount] = useState(String(initial.amount ?? ""));
  const [date, setDate] = useState(initial.donation_date || toLocalISODate(new Date()));
  const [paymentMethod, setPaymentMethod] = useState(initial.payment_method || "מזומן");
  const [bankLines, setBankLines] = useState<PaymentLine[]>(() => seedLines("העברה בנקאית", initial, paymentLines));
  const [checkLines, setCheckLines] = useState<PaymentLine[]>(() => seedLines("צ'ק", initial, paymentLines));

  useEffect(() => {
    if (state?.ok) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isCheck = paymentMethod === "צ'ק";
  const isBankTransfer = paymentMethod === "העברה בנקאית";

  return (
    <form action={formAction} onChange={() => onDirty()} className="space-y-4">
      <div className="flex flex-col items-center gap-1.5">
        <label className="text-xs font-semibold text-ink-soft">מוקד תשלום</label>
        <div className="flex border border-line rounded-full overflow-hidden text-xs bg-white">
          {PAYMENT_HUBS.map((h, i) => (
            <button
              key={h}
              type="button"
              onClick={() => setHub(h)}
              className={`px-3 py-1 transition ${i > 0 ? "border-r border-line" : ""} ${
                hub === h ? "bg-brass text-white font-semibold" : "text-ink-soft hover:bg-parchment"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
        <input type="hidden" name="payment_hub" value={hub} />
      </div>

      <ContactAutocomplete onSelect={() => onDirty()} initialContact={presetContact} />

      <div className="max-w-[220px] mx-auto">
        <Field label="קטגוריה *">
          <CategoryCombobox name="purpose" categories={categories} value={category} onChange={setCategory} required />
        </Field>
      </div>

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
          {PAYMENT_METHOD_BUTTONS.map((m) => (
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
        <div className="border border-line rounded-lg p-3 bg-parchment/40">
          <MultiPaymentLines
            lines={bankLines}
            onChange={setBankLines}
            onAddLine={() => setBankLines((prev) => [...prev, newPaymentLine()])}
            mode="bank"
            contactId={initial.contact_id}
          />
          <input
            type="hidden"
            name="payment_lines"
            value={JSON.stringify(bankLines.map((l) => ({ ...l, amount: Number(l.amount) || 0 })))}
          />
        </div>
      )}

      {isCheck && (
        <div className="border border-line rounded-lg p-3 bg-parchment/40">
          <MultiPaymentLines
            lines={checkLines}
            onChange={setCheckLines}
            onAddLine={() => setCheckLines((prev) => [...prev, newPaymentLine()])}
            mode="check"
            contactId={initial.contact_id}
          />
          <input
            type="hidden"
            name="payment_lines"
            value={JSON.stringify(checkLines.map((l) => ({ ...l, amount: Number(l.amount) || 0 })))}
          />
        </div>
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
