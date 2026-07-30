"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import ContactAutocomplete from "./ContactAutocomplete";
import CategoryCombobox from "./CategoryCombobox";
import CurrencyAmountField from "./CurrencyAmountField";
import HebrewDateHint from "./HebrewDateHint";
import MultiPaymentLines, { newPaymentLine, type PaymentLine } from "./MultiPaymentLines";
import Field from "./FormField";
import SaveButton from "./SaveButton";
import PaymentMethodIcon from "./PaymentMethodIcon";
import { updatePledgeWithPayment, type PledgeFormResult } from "@/app/(app)/donations/pledge-actions";
import type { DonationPaymentLineRow } from "@/app/(app)/donations/actions";
import { PAYMENT_HUBS, PLEDGE_TYPES, PAY_METHODS, type Pledge, type Donation, type Contact } from "@/lib/types";
import { toLocalISODate } from "@/lib/hebrewDate";
import { getCurrentExchangeRate, getHistoricalExchangeRate, type ExchangeRateResult } from "@/lib/exchangeRate";

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

function legacySingleLine(donation: Donation): PaymentLine {
  return {
    id: crypto.randomUUID(),
    amount: String(donation.amount ?? ""),
    bankName: donation.bank_name ?? "",
    branchNumber: donation.branch_number ?? "",
    accountNumber: donation.account_number ?? "",
    checkNumber: donation.check_number ?? "",
    checkDate: donation.check_date || toLocalISODate(new Date()),
  };
}

function seedLines(kind: "צ'ק" | "העברה בנקאית", donation: Donation, rows: DonationPaymentLineRow[]): PaymentLine[] {
  if (donation.payment_method !== kind) return [newPaymentLine()];
  if (rows.length > 0) return rowsToLines(rows);
  if (donation.bank_name || donation.check_number) return [legacySingleLine(donation)];
  return [newPaymentLine()];
}

async function convertToTarget(
  amount: number,
  from: string,
  to: string,
  fetchRate: (cur: string) => Promise<ExchangeRateResult>
): Promise<number | null> {
  if (from === to) return amount;
  const fromRate = from === "₪" ? 1 : (await fetchRate(from)).rate;
  const toRate = to === "₪" ? 1 : (await fetchRate(to)).rate;
  if (!fromRate || !toRate) return null;
  return (amount * fromRate) / toRate;
}

function nextCheckLine(prev: PaymentLine): PaymentLine {
  const numMatch = prev.checkNumber.match(/(\d+)$/);
  return {
    id: crypto.randomUUID(),
    amount: prev.amount,
    bankName: prev.bankName,
    branchNumber: prev.branchNumber,
    accountNumber: prev.accountNumber,
    checkNumber: numMatch ? String(Number(numMatch[1]) + 1) : "",
    checkDate: prev.checkDate ? prev.checkDate : toLocalISODate(new Date()),
  };
}

function nextBankLine(prev: PaymentLine): PaymentLine {
  return { ...prev, id: crypto.randomUUID(), amount: "" };
}

export default function PledgeAndPaymentEditForm({
  pledge,
  donation,
  paymentLines,
  presetContact,
  onDirty,
  onPendingChange,
  onSuccess,
  categories,
  handlers,
  defaultCurrency,
}: {
  pledge: Pledge;
  donation: Donation;
  paymentLines: DonationPaymentLineRow[];
  presetContact: Contact;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (result?: PledgeFormResult) => void;
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultCurrency: string;
}) {
  const boundAction = updatePledgeWithPayment.bind(null, pledge.id, donation.id);
  const [state, formAction] = useFormState(boundAction, null);

  const [hub, setHub] = useState(donation.payment_hub || PAYMENT_HUBS[0]);
  const [category, setCategory] = useState(pledge.category ?? "");
  const [pledgeDate, setPledgeDate] = useState(pledge.pledge_date);
  const [pledgeType, setPledgeType] = useState(pledge.pledge_type || PLEDGE_TYPES[0]);
  const [currency, setCurrency] = useState(pledge.currency || "₪");
  const [amount, setAmount] = useState(String(pledge.amount ?? ""));

  const [paymentMethod, setPaymentMethod] = useState(donation.payment_method || "מזומן");
  const [paymentCurrency, setPaymentCurrency] = useState(donation.currency || "₪");
  const [paymentAmount, setPaymentAmount] = useState(String(donation.amount ?? ""));
  const [paymentDate, setPaymentDate] = useState(donation.donation_date);
  const [checkLines, setCheckLines] = useState<PaymentLine[]>(() => seedLines("צ'ק", donation, paymentLines));
  const [bankLines, setBankLines] = useState<PaymentLine[]>(() => seedLines("העברה בנקאית", donation, paymentLines));
  const [followUp, setFollowUp] = useState(pledge.follow_up ?? "");
  const [handler, setHandler] = useState(pledge.handler ?? "");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [pledgeInTarget, setPledgeInTarget] = useState<number | null>(null);
  const [pledgeConversionError, setPledgeConversionError] = useState<string | null>(null);
  const [paymentInTarget, setPaymentInTarget] = useState<number | null>(null);
  const [paymentConversionError, setPaymentConversionError] = useState<string | null>(null);

  const targetCurrency = defaultCurrency || "₪";
  const isStandingOrder = pledgeType === "הוראת קבע";
  const isBankTransfer = paymentMethod === "העברה בנקאית";
  const isCheck = paymentMethod === "צ'ק";
  const isLineBased = isCheck || isBankTransfer;

  useEffect(() => {
    if (state?.ok) onSuccess(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!amount || Number(amount) <= 0) {
      setPledgeInTarget(null);
      setPledgeConversionError(null);
      return;
    }
    if (currency === targetCurrency) {
      setPledgeInTarget(Number(amount));
      setPledgeConversionError(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const result = await convertToTarget(Number(amount), currency, targetCurrency, getCurrentExchangeRate);
      if (cancelled) return;
      if (result !== null) {
        setPledgeInTarget(result);
        setPledgeConversionError(null);
      } else {
        setPledgeInTarget(null);
        setPledgeConversionError("שגיאה בשליפת שער יציג");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [amount, currency, targetCurrency]);

  useEffect(() => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setPaymentInTarget(null);
      setPaymentConversionError(null);
      return;
    }
    if (paymentCurrency === targetCurrency) {
      setPaymentInTarget(Number(paymentAmount));
      setPaymentConversionError(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const result = await convertToTarget(Number(paymentAmount), paymentCurrency, targetCurrency, (cur) =>
        getHistoricalExchangeRate(cur, paymentDate)
      );
      if (cancelled) return;
      if (result !== null) {
        setPaymentInTarget(result);
        setPaymentConversionError(null);
      } else {
        setPaymentInTarget(null);
        setPaymentConversionError("שגיאה בשליפת שער יציג");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [paymentAmount, paymentCurrency, paymentDate, targetCurrency]);

  useEffect(() => {
    if (isCheck) setPaymentAmount(String(checkLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)));
  }, [isCheck, checkLines]);

  useEffect(() => {
    if (isBankTransfer) setPaymentAmount(String(bankLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)));
  }, [isBankTransfer, bankLines]);

  function handleFormSubmit(e: React.FormEvent) {
    if (paymentMismatch < 0 && !followUp) {
      e.preventDefault();
      setFollowUpError("תשלום חלקי מחייב קביעת תאריך המשך טיפול");
      return;
    }
    setFollowUpError(null);
  }

  const paymentMismatch = pledgeInTarget !== null && paymentInTarget !== null ? paymentInTarget - pledgeInTarget : 0;

  return (
    <form action={formAction} onSubmit={handleFormSubmit} onChange={() => onDirty()} className="space-y-4">
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
        <label className="block text-xs font-semibold text-ink-soft">סכום ההתחייבות</label>
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
          {currency !== targetCurrency && amount && Number(amount) > 0 && (
            <p className="text-[11px] text-ink-soft">
              {pledgeInTarget !== null
                ? `${targetCurrency}${pledgeInTarget.toLocaleString("he-IL", { maximumFractionDigits: 0 })} לפי שער יציג נוכחי`
                : pledgeConversionError ?? "בודק שער יציג..."}
            </p>
          )}
        </div>
        <div />
        <HebrewDateHint dateStr={pledgeDate} attached />
      </div>

      <Field label="פרטים על ההתחייבות">
        <textarea name="details" defaultValue={pledge.details ?? ""} className="in min-h-[60px]" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={paymentMismatch < 0 ? "תאריך המשך טיפול *" : "תאריך המשך טיפול"}>
          <input
            type="date"
            name="follow_up"
            value={followUp}
            onChange={(e) => {
              setFollowUp(e.target.value);
              if (e.target.value) setFollowUpError(null);
            }}
            className="in"
          />
        </Field>
        <Field label="המשך טיפול על ידי">
          <select name="handler" value={handler} onChange={(e) => setHandler(e.target.value)} className="in">
            <option value="">ללא</option>
            {handler && !handlers.some((h) => h.name === handler) && <option value={handler}>{handler}</option>}
            {handlers.map((h) => (
              <option key={h.id} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {followUpError && <p className="text-xs text-wine text-center">{followUpError}</p>}

      <div className="border-t border-line pt-4 space-y-4">
        <h3 className="font-serif text-sm font-bold text-center">פרטי התשלום</h3>

        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">אמצעי תשלום *</label>
          <div className="grid grid-cols-5 gap-2">
            {PAYMENT_METHOD_BUTTONS.map((m) => {
              const disabled = isStandingOrder && m !== "כרטיס אשראי";
              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex flex-col items-center justify-center gap-1.5 px-1.5 py-3 rounded-lg text-xs font-bold border transition ${
                    paymentMethod === m
                      ? "bg-brass text-white border-brass"
                      : disabled
                        ? "border-line bg-parchment/60 text-ink-soft/50 cursor-not-allowed"
                        : "border-line bg-white hover:bg-parchment text-ink"
                  }`}
                >
                  <PaymentMethodIcon method={m} size={20} />
                  <span className="text-center leading-tight">{m}</span>
                </button>
              );
            })}
          </div>
          {isStandingOrder && <p className="text-[11px] text-ink-soft mt-1">הוראת קבע מחייבת תשלום בכרטיס אשראי.</p>}
          <input type="hidden" name="payment_method" value={paymentMethod} />
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 items-start">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-ink-soft">סכום התשלום</label>
            {paymentMismatch !== 0 && (
              <span className="text-[11px] font-semibold text-wine">
                {paymentMismatch > 0 ? "גבוה מההתחייבות" : "נמוך מההתחייבות"}
              </span>
            )}
          </div>
          <label className="block text-xs font-semibold text-ink-soft">תאריך תרומה</label>

          <CurrencyAmountField
            currencyName="payment_currency"
            amountName="payment_amount"
            currency={paymentCurrency}
            onCurrencyChange={setPaymentCurrency}
            amount={paymentAmount}
            onAmountChange={setPaymentAmount}
            readOnly={isLineBased}
          />
          <input
            type="date"
            name="payment_date"
            value={paymentDate}
            onChange={(e) => e.target.value && setPaymentDate(e.target.value)}
            className="in h-11"
          />

          <div>
            {isLineBased && <p className="text-[11px] text-ink-soft">מחושב אוטומטית מסכום השורות</p>}
            {!isLineBased && paymentCurrency !== targetCurrency && paymentAmount && Number(paymentAmount) > 0 && (
              <p className="text-[11px] text-ink-soft">
                {paymentInTarget !== null
                  ? `${targetCurrency}${paymentInTarget.toLocaleString("he-IL", { maximumFractionDigits: 0 })} לפי שער יציג ליום התשלום`
                  : paymentConversionError ?? "בודק שער יציג..."}
              </p>
            )}
          </div>
          <HebrewDateHint dateStr={paymentDate} attached />
        </div>

        {isBankTransfer && (
          <div className="border border-line rounded-lg p-3 bg-parchment/40">
            <MultiPaymentLines
              lines={bankLines}
              onChange={setBankLines}
              onAddLine={() => setBankLines((prev) => [...prev, nextBankLine(prev[prev.length - 1])])}
              mode="bank"
              contactId={pledge.contact_id}
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
              onAddLine={() => setCheckLines((prev) => [...prev, nextCheckLine(prev[prev.length - 1])])}
              mode="check"
              contactId={pledge.contact_id}
            />
            <input
              type="hidden"
              name="payment_lines"
              value={JSON.stringify(checkLines.map((l) => ({ ...l, amount: Number(l.amount) || 0 })))}
            />
          </div>
        )}
      </div>

      {state?.error && <p className="text-sm text-wine text-center">{state.error}</p>}

      <div className="flex justify-center pt-2">
        <SaveButton onPendingChange={onPendingChange} />
      </div>
    </form>
  );
}
