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
import { createPledgeWithPayment, type PledgeFormResult } from "@/app/(app)/donations/pledge-actions";
import { createPendingNedarimCharge, getNedarimChargeStatus } from "@/app/(app)/donations/nedarim-actions";
import { createStripeCheckoutSession } from "@/app/(app)/donations/stripe-actions";
import { PAYMENT_HUBS, PLEDGE_TYPES, PAY_METHODS, type Contact } from "@/lib/types";
import { toLocalISODate, parseLocalISODate } from "@/lib/hebrewDate";
import { getCurrentExchangeRate, getHistoricalExchangeRate, type ExchangeRateResult } from "@/lib/exchangeRate";
import {
  NEDARIM_CURRENCY_CODES,
  NEDARIM_SUPPORTED_HUB,
  isNedarimSupportedCurrency,
  isNedarimSuccessStatus,
  type NedarimTransactionResult,
} from "@/lib/nedarim";
import { isStripeSupportedCurrency } from "@/lib/stripeShared";

type NamedItem = { id: string; name: string };

// "הוראת קבע" אינה אמצעי תשלום בפועל (היא סוג ההתחייבות) - הסדרת התשלום המיידי שלה
// היא תמיד בכרטיס אשראי, שנבחר אוטומטית ושאר האמצעים ננעלים
const ALL_PAYMENT_METHOD_BUTTONS = PAY_METHODS.filter((m) => m !== "הוראת קבע");

function addMonths(dateStr: string, months: number): string {
  const d = parseLocalISODate(dateStr);
  d.setMonth(d.getMonth() + months);
  return toLocalISODate(d);
}

// ממיר סכום ממטבע אחד לשני דרך שקלים כמטבע-ביניים, לפי שערים שנשלפו כבר (נוכחי או היסטורי,
// לפי מה שהעביר הקורא) - כדי שהאזהרה על סטייה מסכום ההתחייבות תעבוד גם בין מטבעות שונים
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
    checkDate: prev.checkDate ? addMonths(prev.checkDate, 1) : toLocalISODate(new Date()),
  };
}

function nextBankLine(prev: PaymentLine): PaymentLine {
  return { ...prev, id: crypto.randomUUID(), amount: "" };
}

export default function PledgeAndPaymentForm({
  onDirty,
  onPendingChange,
  onSuccess,
  categories,
  handlers,
  defaultHub,
  defaultCurrency,
  defaultCategory,
  presetContact,
  currentUserName,
}: {
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (result?: PledgeFormResult) => void;
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
  defaultCategory?: string;
  presetContact?: Contact;
  currentUserName?: string;
}) {
  const [state, formAction] = useFormState(createPledgeWithPayment, null);
  const nedarimRef = useRef<NedarimHandle>(null);

  const [hub, setHub] = useState(defaultHub || PAYMENT_HUBS[0]);
  const [contact, setContact] = useState<ContactWithBalance | null>(null);
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [pledgeDate, setPledgeDate] = useState(() => toLocalISODate(new Date()));
  const [pledgeType, setPledgeType] = useState(PLEDGE_TYPES[0]);
  const [currency, setCurrency] = useState(defaultCurrency || "₪");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState(defaultCurrency || "₪");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => toLocalISODate(new Date()));
  const [checkLines, setCheckLines] = useState<PaymentLine[]>([newPaymentLine()]);
  const [bankLines, setBankLines] = useState<PaymentLine[]>([newPaymentLine()]);
  const [followUp, setFollowUp] = useState("");
  const [handler, setHandler] = useState(currentUserName ?? "");
  const [methodError, setMethodError] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardPolling, setCardPolling] = useState(false);
  const [chargeRefId, setChargeRefId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [pledgeInTarget, setPledgeInTarget] = useState<number | null>(null);
  const [pledgeConversionError, setPledgeConversionError] = useState<string | null>(null);
  const [paymentInTarget, setPaymentInTarget] = useState<number | null>(null);
  const [paymentConversionError, setPaymentConversionError] = useState<string | null>(null);

  // המטבע המשותף להשוואת התחייבות מול תשלום: ברירת המחדל האישית של המשתמש (או ש"ח)
  const targetCurrency = defaultCurrency || "₪";

  const isStandingOrder = pledgeType === "הוראת קבע";
  const isCard = paymentMethod === "כרטיס אשראי";
  const isBankTransfer = paymentMethod === "העברה בנקאית";
  const isCheck = paymentMethod === "צ'ק";
  const isLineBased = isCheck || isBankTransfer;
  // "כרטיס אשראי" זמין בכל מוקד לתשלום חד-פעמי (ישראל דרך נדרים פלוס, אחרת דרך
  // Stripe - ר' isCard render למטה) - הוראת קבע נשארת מוגבלת לנדרים פלוס/ישראל
  // בלבד (ללא שינוי, ר' ההערה על useEffect למטה)
  const paymentMethodButtons = ALL_PAYMENT_METHOD_BUTTONS;

  useEffect(() => {
    if (state?.ok) onSuccess(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // הוראת קבע דורשת חיוב בכרטיס אשראי (נתמך רק במוקד תשלום ישראל דרך נדרים פלוס) -
  // נבחר אוטומטית ושאר אמצעי התשלום ננעלים; במוקד אחר אין אמצעי תשלום זמין להו"ק
  useEffect(() => {
    if (isStandingOrder && hub === NEDARIM_SUPPORTED_HUB) setPaymentMethod("כרטיס אשראי");
    else if (isStandingOrder) setPaymentMethod("");
  }, [isStandingOrder, hub]);

  // המרת סכום ההתחייבות למטבע המשותף לפי שער יציג נוכחי
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

  // המרת סכום התשלום המיידי למטבע המשותף לפי שער יציג ליום התשלום (היסטורי)
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
    if (!paymentMethod) {
      e.preventDefault();
      setMethodError("יש לבחור אמצעי תשלום");
      return;
    }
    setMethodError(null);
    if (paymentMismatch < 0 && !followUp) {
      e.preventDefault();
      setFollowUpError("תשלום חלקי מחייב קביעת תאריך המשך טיפול");
      return;
    }
    setFollowUpError(null);
  }

  async function handleCardSubmit() {
    const mosad = process.env.NEXT_PUBLIC_NEDARIM_MOSAD;
    const apiValid = process.env.NEXT_PUBLIC_NEDARIM_API_VALID;
    if (!mosad || !apiValid) {
      setCardError("סליקת אשראי אינה מוגדרת (חסרים פרטי מוסד ב-.env.local)");
      return;
    }
    if (!contact || !paymentAmount || Number(paymentAmount) <= 0) return;
    setCardError(null);
    setCardSubmitting(true);

    // מזהה ייחודי (נשלח כ-Param1 לנדרים פלוס וחוזר בעדכון ה-CallBack) - כך אפשר לשייך
    // את האישור השרתי האמיתי לעסקה הממתינה הנכונה, בלי לסמוך על תגובת הצד-לקוח בלבד
    const refId = crypto.randomUUID();
    const fields: Record<string, string> = {
      contact_id: contact.id,
      category,
      pledge_type: pledgeType,
      currency,
      amount: String(amount),
      details,
      pledge_date: pledgeDate,
      payment_hub: hub,
      follow_up: followUp,
      handler,
      payment_amount: paymentAmount,
      payment_method: "כרטיס אשראי",
      payment_currency: paymentCurrency,
      payment_date: paymentDate,
    };
    const pending = await createPendingNedarimCharge(refId, "pledge_and_payment", fields, Number(paymentAmount), paymentCurrency);
    if (!pending.ok) {
      setCardSubmitting(false);
      setCardError(pending.error ?? "שגיאה בהכנת העסקה");
      return;
    }
    setChargeRefId(refId);
    nedarimRef.current?.submitPayment(mosad, apiValid, refId, {
      FirstName: contact.first_name,
      LastName: contact.last_name,
      Phone: contact.phone,
      City: contact.city ?? "",
      Amount: paymentAmount,
      Currency: NEDARIM_CURRENCY_CODES[paymentCurrency],
      Groupe: category || "תשלום כללי",
    });
  }

  // מוקדים שאינם ישראל, תשלום חד-פעמי (לא הוראת קבע): כרטיס אשראי עובר דרך
  // Stripe Checkout (hosted redirect) - ר' אותה הערה ב-PaymentOnlyForm.tsx
  async function handleStripeCardSubmit() {
    if (!contact || !paymentAmount || Number(paymentAmount) <= 0) return;
    setCardError(null);
    setCardSubmitting(true);
    const fields: Record<string, string> = {
      contact_id: contact.id,
      category,
      pledge_type: pledgeType,
      currency,
      amount: String(amount),
      details,
      pledge_date: pledgeDate,
      payment_hub: hub,
      follow_up: followUp,
      handler,
      payment_amount: paymentAmount,
      payment_method: "כרטיס אשראי",
      payment_currency: paymentCurrency,
      payment_date: paymentDate,
    };
    const result = await createStripeCheckoutSession("pledge_and_payment", fields, Number(paymentAmount), paymentCurrency);
    if (!result.ok || !result.url) {
      setCardSubmitting(false);
      setCardError(result.error ?? "שגיאה ביצירת עסקת Stripe");
      return;
    }
    window.location.href = result.url;
  }

  function handleNedarimResult(result: NedarimTransactionResult) {
    if (!isNedarimSuccessStatus(String(result.Status ?? ""))) {
      setCardSubmitting(false);
      setCardError(result.Message || "העסקה נכשלה. יש לנסות שוב.");
      return;
    }
    // הדפדפן דיווח על הצלחה - אבל זו רק תגובת צד-לקוח שניתנת לזיוף. ההתחייבות/תשלום
    // נחשבים סופיים רק לאחר שמתקבל אישור אמיתי מהשרת של נדרים פלוס (CallBack)
    setCardSubmitting(false);
    setCardPolling(true);
  }

  useEffect(() => {
    if (!cardPolling || !chargeRefId) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(async () => {
      attempts++;
      const result = await getNedarimChargeStatus(chargeRefId);
      if (cancelled) return;
      if (result.status === "confirmed") {
        clearInterval(interval);
        setCardPolling(false);
        onSuccess({
          ok: true,
          pledgeId: result.pledgeId,
          donationId: result.donationId,
          contactId: result.contactId,
          followUp: result.followUp,
          handler: result.handler,
          category: result.category,
          details: result.details,
        });
      } else if (result.status === "failed" || result.status === "not_found") {
        clearInterval(interval);
        setCardPolling(false);
        setCardError(result.status === "failed" ? result.error : "אירעה שגיאה באימות התשלום");
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setCardPolling(false);
        setCardError("אישור התשלום מתעכב. ייתכן שהתשלום עדיין יירשם בדקות הקרובות - נא לבדוק בהיסטוריית התרומות בעוד רגע.");
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cardPolling, chargeRefId, onSuccess]);

  // אזהרה כשסכום התשלום המיידי שונה מסכום ההתחייבות - משווה את שני הסכומים אחרי המרה
  // למטבע משותף, כך שזה עובד גם כששני הסכומים במטבעות שונים
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

      <ContactAutocomplete
        onSelect={(c) => {
          setContact(c);
          onDirty();
        }}
        initialContact={presetContact}
      />

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
        <textarea name="details" value={details} onChange={(e) => setDetails(e.target.value)} className="in min-h-[60px]" />
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
            {currentUserName && !handlers.some((h) => h.name === currentUserName) && (
              <option value={currentUserName}>{currentUserName}</option>
            )}
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
        <h3 className="font-serif text-sm font-bold text-center">פרטי התשלום המיידי</h3>

        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">אמצעי תשלום *</label>
          <div className="grid grid-cols-5 gap-2">
            {paymentMethodButtons.map((m) => {
              const disabled = isStandingOrder && m !== "כרטיס אשראי";
              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setPaymentMethod(m);
                    setMethodError(null);
                  }}
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
          {isStandingOrder && hub !== NEDARIM_SUPPORTED_HUB && (
            <p className="text-[11px] text-wine mt-1">
              הוראת קבע באשראי זמינה רק במוקד תשלום {NEDARIM_SUPPORTED_HUB}. יש לבחור מוקד {NEDARIM_SUPPORTED_HUB} או סוג התחייבות אחר.
            </p>
          )}
          {isStandingOrder && hub === NEDARIM_SUPPORTED_HUB && (
            <p className="text-[11px] text-ink-soft mt-1">הוראת קבע מחייבת תשלום בכרטיס אשראי.</p>
          )}
          <input type="hidden" name="payment_method" value={paymentMethod} />
          {methodError && <p className="text-xs text-wine mt-1">{methodError}</p>}
        </div>

        {paymentMethod && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 items-start">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-ink-soft">סכום לתשלום עכשיו</label>
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
        )}

        {isCard && (
          <div className="space-y-3">
            {isStandingOrder && hub !== NEDARIM_SUPPORTED_HUB ? (
              <p className="text-sm text-wine border border-wine/40 rounded-lg p-3 bg-white">
                הוראת קבע באשראי זמינה רק במוקד תשלום {NEDARIM_SUPPORTED_HUB}.
              </p>
            ) : hub === NEDARIM_SUPPORTED_HUB ? (
              !isNedarimSupportedCurrency(paymentCurrency) ? (
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
                    disabled={!paymentAmount || Number(paymentAmount) <= 0 || cardSubmitting || cardPolling}
                    className="w-full bg-brass hover:bg-brass-deep text-white font-semibold rounded-full py-2.5 text-sm transition disabled:opacity-50"
                  >
                    {cardPolling ? "מאמת מול נדרים פלוס..." : cardSubmitting ? "מעבד תשלום..." : "שליחה לתשלום מאובטח"}
                  </button>
                  {cardError && <p className="text-sm text-wine text-center">{cardError}</p>}
                </>
              )
            ) : !isStripeSupportedCurrency(paymentCurrency) ? (
              <p className="text-sm text-wine border border-wine/40 rounded-lg p-3 bg-white">
                סליקת אשראי (Stripe) נתמכת רק במטבעות ₪/$/€/£/CHF.
              </p>
            ) : !contact ? (
              <p className="text-sm text-ink-soft border border-line rounded-lg p-3 bg-parchment/40">
                יש לבחור איש קשר לפני התשלום.
              </p>
            ) : (
              <>
                <p className="text-xs text-ink-soft text-center">התשלום יתבצע דרך דף מאובטח של Stripe - תועבר/י אליו כעת.</p>
                <button
                  type="button"
                  onClick={handleStripeCardSubmit}
                  disabled={!paymentAmount || Number(paymentAmount) <= 0 || cardSubmitting}
                  className="w-full bg-brass hover:bg-brass-deep text-white font-semibold rounded-full py-2.5 text-sm transition disabled:opacity-50"
                >
                  {cardSubmitting ? "מעביר לתשלום מאובטח..." : "שליחה לתשלום מאובטח (Stripe)"}
                </button>
                {cardError && <p className="text-sm text-wine text-center">{cardError}</p>}
              </>
            )}
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
              contactId={contact?.id}
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

      {!isCard && (
        <div className="flex justify-center pt-2">
          <SaveButton onPendingChange={onPendingChange} />
        </div>
      )}
    </form>
  );
}
