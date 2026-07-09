"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import ContactAutocomplete from "./ContactAutocomplete";
import CategoryCombobox from "./CategoryCombobox";
import CurrencyAmountField from "./CurrencyAmountField";
import HebrewDateHint from "./HebrewDateHint";
import Field from "./FormField";
import SaveButton from "./SaveButton";
import type { PledgeFormResult } from "@/app/(app)/donations/pledge-actions";
import { CURRENCIES, PLEDGE_TYPES, type Contact, type Pledge } from "@/lib/types";
import { toLocalISODate } from "@/lib/hebrewDate";
import { getCurrentExchangeRate } from "@/lib/exchangeRate";

type NamedItem = { id: string; name: string };

export default function PledgeForm({
  action,
  initial,
  contactName,
  presetContact,
  onDirty,
  onPendingChange,
  onSuccess,
  categories,
  handlers,
  defaultCurrency,
}: {
  action: (prevState: PledgeFormResult | null, formData: FormData) => Promise<PledgeFormResult>;
  initial?: Partial<Pledge>;
  contactName?: string;
  presetContact?: Contact;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultCurrency?: string;
}) {
  const [state, formAction] = useFormState(action, null);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [pledgeDate, setPledgeDate] = useState(() => initial?.pledge_date || toLocalISODate(new Date()));
  const [pledgeType, setPledgeType] = useState(initial?.pledge_type || PLEDGE_TYPES[0]);
  const [currency, setCurrency] = useState(initial?.currency || defaultCurrency || CURRENCIES[0]);
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [conversion, setConversion] = useState<{ rate: number; asOf?: string } | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (currency === "₪" || !amount || Number(amount) <= 0) {
      setConversion(null);
      setConversionError(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const result = await getCurrentExchangeRate(currency);
      if (cancelled) return;
      if (result.ok && result.rate) {
        setConversion({ rate: result.rate, asOf: result.asOf });
        setConversionError(null);
      } else {
        setConversion(null);
        setConversionError(result.error ?? "שגיאה בשליפת שער יציג");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [currency, amount]);

  return (
    <form action={formAction} onChange={() => onDirty()} className="space-y-4">
      {contactName ? (
        <Field label="תורם">
          <div className="in bg-parchment/60">{contactName}</div>
        </Field>
      ) : (
        <ContactAutocomplete onSelect={() => onDirty()} initialContact={presetContact} />
      )}

      <div className="max-w-[220px] mx-auto">
        <Field label="קטגוריה *">
          <CategoryCombobox
            name="category"
            categories={categories}
            value={category}
            onChange={setCategory}
            required
            placeholder="בחר או הקלד קטגוריה..."
          />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1.5 items-start">
        <label className="block text-xs font-semibold text-ink-soft">סכום</label>
        <label className="block text-xs font-semibold text-ink-soft text-center">סוג</label>
        <label className="block text-xs font-semibold text-ink-soft">תאריך ההתחייבות</label>

        <CurrencyAmountField
          currencyName="currency"
          amountName="amount"
          currency={currency}
          onCurrencyChange={setCurrency}
          amount={amount}
          onAmountChange={setAmount}
        />
        <div className="flex border border-line rounded-lg overflow-hidden text-xs bg-white h-11">
          {PLEDGE_TYPES.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => setPledgeType(t)}
              className={`px-2.5 transition whitespace-nowrap ${i > 0 ? "border-r border-line" : ""} ${
                pledgeType === t ? "bg-brass text-white font-semibold" : "text-ink-soft hover:bg-parchment"
              }`}
            >
              {t === "הוראת קבע" ? 'הו"ק' : "תרומה"}
            </button>
          ))}
        </div>
        <input
          type="date"
          name="pledge_date"
          value={pledgeDate}
          onChange={(e) => e.target.value && setPledgeDate(e.target.value)}
          className="in h-11"
        />
        <input type="hidden" name="pledge_type" value={pledgeType} />

        <div>
          {currency !== "₪" && amount && Number(amount) > 0 && (
            <p className="text-[11px] text-ink-soft">
              {conversion
                ? `₪${(Number(amount) * conversion.rate).toLocaleString("he-IL", { maximumFractionDigits: 0 })} לפי שער יציג נוכחי`
                : conversionError ?? "בודק שער יציג..."}
            </p>
          )}
        </div>
        <div />
        <HebrewDateHint dateStr={pledgeDate} attached />
      </div>

      <Field label="פרטים על ההתחייבות">
        <textarea name="details" defaultValue={initial?.details ?? ""} className="in min-h-[60px]" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך המשך טיפול">
          <input type="date" name="follow_up" defaultValue={initial?.follow_up ?? ""} className="in" />
        </Field>
        <Field label="המשך טיפול על ידי">
          <select name="handler" defaultValue={initial?.handler ?? ""} className="in">
            <option value="">ללא</option>
            {initial?.handler && !handlers.some((h) => h.name === initial.handler) && (
              <option value={initial.handler}>{initial.handler}</option>
            )}
            {handlers.map((h) => (
              <option key={h.id} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {state?.error && <p className="text-sm text-wine text-center">{state.error}</p>}

      <div className="flex justify-center pt-2">
        <SaveButton onPendingChange={onPendingChange} />
      </div>
    </form>
  );
}
