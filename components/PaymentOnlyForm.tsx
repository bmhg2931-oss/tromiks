"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import ContactAutocomplete, { type ContactWithBalance } from "./ContactAutocomplete";
import CategoryCombobox from "./CategoryCombobox";
import CurrencyAmountField from "./CurrencyAmountField";
import HebrewDateHint from "./HebrewDateHint";
import MultiPaymentLines, { newPaymentLine, type PaymentLine } from "./MultiPaymentLines";
import Field from "./FormField";
import SaveButton from "./SaveButton";
import PaymentMethodIcon from "./PaymentMethodIcon";
import NedarimIframe, { type NedarimHandle } from "./NedarimIframe";
import { createDonation, markSurplusAsBonusPledge } from "@/app/(app)/donations/actions";
import { PAYMENT_HUBS, PAY_METHODS, type Contact } from "@/lib/types";
import { toLocalISODate, parseLocalISODate } from "@/lib/hebrewDate";
import { getHistoricalExchangeRate } from "@/lib/exchangeRate";
import { NEDARIM_CURRENCY_CODES, isNedarimSupportedCurrency, type NedarimTransactionResult } from "@/lib/nedarim";

type NamedItem = { id: string; name: string };

// הוראת קבע לא מוצגת כאן: היא נכללת בזרימת כרטיס האשראי
const PAYMENT_METHOD_BUTTONS = PAY_METHODS.filter((m) => m !== "הוראת קבע");

function addMonths(dateStr: string, months: number): string {
  const d = parseLocalISODate(dateStr);
  d.setMonth(d.getMonth() + months);
  return toLocalISODate(d);
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
    checkDate: prev.checkDate ? addMonths(prev.checkDate, 1) : toLocalISODate(new Date()),
  };
}

function nextBankLine(prev: PaymentLine): PaymentLine {
  return { ...prev, id: crypto.randomUUID(), amount: "" };
}

export default function PaymentOnlyForm({
  onDirty,
  onPendingChange,
  onSuccess,
  categories,
  defaultHub,
  defaultCurrency,
  defaultCategory,
  presetContact,
}: {
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  categories: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
  defaultCategory?: string;
  presetContact?: Contact;
}) {
  const [state, formAction] = useFormState(createDonation, null);
  const formRef = useRef<HTMLFormElement>(null);
  const nedarimRef = useRef<NedarimHandle>(null);
  const [hub, setHub] = useState(defaultHub || PAYMENT_HUBS[0]);
  const [contact, setContact] = useState<ContactWithBalance | null>(null);
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [checkLines, setCheckLines] = useState<PaymentLine[]>([newPaymentLine()]);
  const [bankLines, setBankLines] = useState<PaymentLine[]>([newPaymentLine()]);
  const [date, setDate] = useState(() => toLocalISODate(new Date()));
  const [followUp, setFollowUp] = useState("");
  const [followUpDetails, setFollowUpDetails] = useState("");
  const [methodError, setMethodError] = useState<string | null>(null);
  const [conversion, setConversion] = useState<{ rate: number; asOf?: string } | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [cardConfirmed, setCardConfirmed] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [surplusInfo, setSurplusInfo] = useState<{ donationId: string; amount: number; currency: string } | null>(null);
  const [resolvingSurplus, setResolvingSurplus] = useState(false);

  useEffect(() => {
    if (!state?.ok) return;
    if (state.surplus && state.surplus > 0.5 && state.surplusCurrency && state.donationId) {
      setSurplusInfo({ donationId: state.donationId, amount: state.surplus, currency: state.surplusCurrency });
    } else {
      onSuccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleKeepAsCredit() {
    setSurplusInfo(null);
    onSuccess();
  }

  async function handleMarkAsBonus() {
    if (!contact || !surplusInfo) return;
    setResolvingSurplus(true);
    await markSurplusAsBonusPledge(contact.id, surplusInfo.donationId, surplusInfo.amount, surplusInfo.currency, category, date);
    setResolvingSurplus(false);
    setSurplusInfo(null);
    onSuccess();
  }

  useEffect(() => {
    if (currency === "₪" || !amount || Number(amount) <= 0) {
      setConversion(null);
      setConversionError(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const result = await getHistoricalExchangeRate(currency, date);
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
  }, [currency, amount, date]);

  const isCard = paymentMethod === "כרטיס אשראי";
  const isBankTransfer = paymentMethod === "העברה בנקאית";
  const isCheck = paymentMethod === "צ'ק";
  const isLineBased = isCheck || isBankTransfer;

  useEffect(() => {
    if (isCheck) setAmount(String(checkLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)));
  }, [isCheck, checkLines]);

  useEffect(() => {
    if (isBankTransfer) setAmount(String(bankLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)));
  }, [isBankTransfer, bankLines]);

  function handleFormSubmit(e: React.FormEvent) {
    if (!paymentMethod) {
      e.preventDefault();
      setMethodError("יש לבחור אמצעי תשלום");
      return;
    }
    setMethodError(null);
  }

  function handleCardSubmit() {
    const mosad = process.env.NEXT_PUBLIC_NEDARIM_MOSAD;
    const apiValid = process.env.NEXT_PUBLIC_NEDARIM_API_VALID;
    if (!mosad || !apiValid) {
      setCardError("סליקת אשראי אינה מוגדרת (חסרים פרטי מוסד ב-.env.local)");
      return;
    }
    if (!contact || !amount || Number(amount) <= 0) return;
    setCardError(null);
    setCardSubmitting(true);
    nedarimRef.current?.submitPayment(mosad, apiValid, {
      FirstName: contact.first_name,
      LastName: contact.last_name,
      Phone: contact.phone,
      City: contact.city ?? "",
      Amount: amount,
      Currency: NEDARIM_CURRENCY_CODES[currency],
      Groupe: category || "תשלום כללי",
    });
  }

  function handleNedarimResult(result: NedarimTransactionResult) {
    setCardSubmitting(false);
    const ok = /^(ok|true|1|אישור|בוצע|success)/i.test(String(result.Status ?? ""));
    if (ok) {
      setCardConfirmed(true);
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    } else {
      setCardError(result.Message || "העסקה נכשלה. יש לנסות שוב.");
    }
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={handleFormSubmit} onChange={() => onDirty()} className="space-y-4">
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

      <ContactAutocomplete
        onSelect={(c) => {
          setContact(c);
          onDirty();
        }}
        initialContact={presetContact}
      />

      <div className="max-w-[220px] mx-auto">
        <Field label="קטגוריה (אופציונלי)">
          <CategoryCombobox name="purpose" categories={categories} value={category} onChange={setCategory} />
        </Field>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-soft mb-1">אמצעי תשלום *</label>
        <div className="grid grid-cols-5 gap-2">
          {PAYMENT_METHOD_BUTTONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setPaymentMethod(m);
                setMethodError(null);
              }}
              className={`flex flex-col items-center justify-center gap-1.5 px-1.5 py-3 rounded-lg text-xs font-bold border transition ${
                paymentMethod === m ? "bg-brass text-white border-brass" : "border-line bg-white hover:bg-parchment text-ink"
              }`}
            >
              <PaymentMethodIcon method={m} size={20} />
              <span className="text-center leading-tight">{m}</span>
            </button>
          ))}
        </div>
        {methodError && <p className="text-xs text-wine mt-1">{methodError}</p>}
      </div>

      {paymentMethod && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 items-start">
          <label className="block text-xs font-semibold text-ink-soft">סכום</label>
          <label className="block text-xs font-semibold text-ink-soft">תאריך תרומה</label>

          <CurrencyAmountField
            currencyName="currency"
            amountName="amount"
            currency={currency}
            onCurrencyChange={setCurrency}
            amount={amount}
            onAmountChange={setAmount}
            readOnly={isLineBased}
          />
          <input
            type="date"
            name="donation_date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="in h-11"
          />

          <div>
            {isLineBased && <p className="text-[11px] text-ink-soft">מחושב אוטומטית מסכום השורות</p>}
            {!isLineBased && currency !== "₪" && amount && Number(amount) > 0 && (
              <p className="text-[11px] text-ink-soft">
                {conversion
                  ? `(במט"ח) ₪${(Number(amount) * conversion.rate).toLocaleString("he-IL", { maximumFractionDigits: 0 })} לפי שער יציג ליום התשלום`
                  : conversionError ?? "בודק שער יציג..."}
              </p>
            )}
          </div>
          <HebrewDateHint dateStr={date} attached />
        </div>
      )}

      {isCard && (
        <div className="space-y-3">
          {!isNedarimSupportedCurrency(currency) ? (
            <p className="text-sm text-wine border border-wine/40 rounded-lg p-3 bg-white">
              סליקת אשראי נתמכת רק בתשלום בשקל או דולר.
            </p>
          ) : !contact ? (
            <p className="text-sm text-ink-soft border border-line rounded-lg p-3 bg-parchment/40">
              יש לבחור איש קשר לפני התשלום.
            </p>
          ) : (
            <>
              <NedarimIframe ref={nedarimRef} onResult={handleNedarimResult} />
              <button
                type="button"
                onClick={handleCardSubmit}
                disabled={!amount || Number(amount) <= 0 || cardSubmitting || cardConfirmed}
                className="w-full bg-brass hover:bg-brass-deep text-white font-semibold rounded-full py-2.5 text-sm transition disabled:opacity-50"
              >
                {cardConfirmed ? "התשלום אושר, שומר..." : cardSubmitting ? "מעבד תשלום..." : "שליחה לתשלום מאובטח"}
              </button>
              {cardError && <p className="text-sm text-wine text-center">{cardError}</p>}
            </>
          )}
          <input type="hidden" name="card_transaction_ok" value={cardConfirmed ? "1" : ""} />
        </div>
      )}

      {isBankTransfer && (
        <div className="border border-line rounded-lg p-3 bg-parchment/40">
          <MultiPaymentLines
            lines={bankLines}
            onChange={setBankLines}
            onAddLine={() => setBankLines((prev) => [...prev, nextBankLine(prev[prev.length - 1])])}
            mode="bank"
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
          />
          <input
            type="hidden"
            name="payment_lines"
            value={JSON.stringify(checkLines.map((l) => ({ ...l, amount: Number(l.amount) || 0 })))}
          />
        </div>
      )}

      {paymentMethod && (
        <>
          <Field label="הערות">
            <textarea name="notes" className="in min-h-[50px]" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך המשך טיפול (אופציונלי)">
              <input
                type="date"
                name="follow_up"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                className="in"
              />
            </Field>
            <Field label="פרטי המשך טיפול">
              <input
                type="text"
                name="follow_up_details"
                value={followUpDetails}
                onChange={(e) => setFollowUpDetails(e.target.value)}
                className="in"
              />
            </Field>
          </div>
        </>
      )}

      {state?.error && <p className="text-sm text-wine text-center">{state.error}</p>}

      {!isCard && (
        <div className="flex justify-center pt-2">
          <SaveButton onPendingChange={onPendingChange} />
        </div>
      )}

      {surplusInfo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-sm w-full p-6 text-center space-y-3">
            <p className="text-sm font-semibold">
              התשלום נשמר, אך הוא גבוה מסך היתרה הפתוחה של איש הקשר בעודף של {surplusInfo.currency}
              {surplusInfo.amount.toLocaleString("he-IL")}.
            </p>
            <p className="text-xs text-ink-soft">כיצד לטפל בעודף?</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleKeepAsCredit}
                className="border border-line rounded-full px-4 py-2 text-sm hover:bg-parchment transition"
              >
                השאר כזיכוי
              </button>
              <button
                type="button"
                onClick={handleMarkAsBonus}
                disabled={resolvingSurplus}
                className="bg-brass hover:bg-brass-deep text-white rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
              >
                {resolvingSurplus ? "שומר..." : "סמן כתרומת בונוס"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
