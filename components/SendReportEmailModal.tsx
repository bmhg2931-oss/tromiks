"use client";

import { useEffect, useRef, useState } from "react";
import { getSendReportEmailDefaults, emailContactReport, searchEmailContacts, type EmailContactSuggestion } from "@/app/(app)/contacts/report-actions";
import SelectDropdown from "./SelectDropdown";

type Status = "idle" | "sending" | "success" | "error";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// אנימציית "שליחה" - מטוס נייר עף באלכסון בלולאה, מוצגת כשכבת-על מעל הטופס (שכבר
// בגודלו המלא) גם בזמן טעינת נתוני ברירת המחדל וגם בזמן השליחה בפועל - כדי
// שהחלון ייפתח מיד בגודל הסופי שלו בלי "קפיצה" ובלי טקסט "טוען..."/"שולח..." יבש
function SendingOverlay({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 bg-white/85 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 z-10">
      <svg
        width="52"
        height="52"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="send-fly text-brass"
      >
        <path d="M2 8l11.5-5.5L9 14l-1.8-5.2L2 8Z" />
        <path d="M7.2 8.8L13.5 2.5" />
      </svg>
      <p className="text-sm text-ink-soft">{text}</p>
      <style jsx>{`
        .send-fly {
          animation: send-fly 1.4s ease-in-out infinite;
        }
        @keyframes send-fly {
          0% {
            transform: translate(-10px, 6px) rotate(-6deg);
            opacity: 0.6;
          }
          50% {
            transform: translate(10px, -6px) rotate(6deg);
            opacity: 1;
          }
          100% {
            transform: translate(-10px, 6px) rotate(-6deg);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}

export default function SendReportEmailModal({
  contactId,
  title,
  docNotes,
  onClose,
}: {
  contactId: string;
  title: string;
  docNotes: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EmailContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [paymentHubs, setPaymentHubs] = useState<{ hub: string; url: string }[]>([]);
  const [paymentHub, setPaymentHub] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSendReportEmailDefaults(contactId, title).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError(res.error ?? "שגיאה בטעינת נתוני שליחה");
        return;
      }
      if (res.contactEmail) setRecipients([res.contactEmail]);
      setSubject(res.defaultSubject ?? title);
      setBody(res.defaultBody ?? "");
      setPaymentHubs(res.paymentHubs ?? []);
      if (res.defaultPaymentHub && (res.paymentHubs ?? []).some((p) => p.hub === res.defaultPaymentHub)) {
        setPaymentHub(res.defaultPaymentHub);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, title]);

  function handleRecipientInputChange(value: string) {
    setRecipientInput(value);
    setRecipientError(null);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      const res = await searchEmailContacts(value);
      if (res.ok) {
        setSuggestions(res.contacts ?? []);
        setShowSuggestions((res.contacts ?? []).length > 0);
      }
    }, 250);
  }

  function addRecipientEmail(email: string) {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setRecipientError("הזן כתובת דוא&quot;ל תקינה");
      return;
    }
    if (!recipients.includes(trimmed)) setRecipients((r) => [...r, trimmed]);
    setRecipientInput("");
    setRecipientError(null);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function removeRecipient(email: string) {
    setRecipients((r) => r.filter((e) => e !== email));
  }

  async function handleSend() {
    if (recipients.length === 0) {
      setRecipientError("יש להזין לפחות כתובת דוא&quot;ל אחת");
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    const res = await emailContactReport({ contactId, recipients, subject, body, paymentHub: paymentHub || undefined, title, docNotes });
    if (res.ok) {
      setStatus("success");
    } else {
      setStatus("error");
      setErrorMsg(res.error ?? "שגיאה בשליחה");
    }
  }

  const formDisabled = loading || !!loadError;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-serif text-lg font-bold">שליחת {title} במייל</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none px-2">
            ×
          </button>
        </div>

        {status === "success" ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-brass/15 text-brass flex items-center justify-center text-3xl">✓</div>
            <p className="font-semibold">נשלח בהצלחה</p>
            <p className="text-xs text-ink-soft">המייל נשלח אל: {recipients.join(", ")}</p>
            <button
              onClick={onClose}
              className="mt-2 bg-brass hover:bg-brass-deep text-white text-sm font-semibold rounded-full px-6 py-2"
            >
              סגירה
            </button>
          </div>
        ) : (
          <div className="relative">
            {loading && <SendingOverlay text="מכין את טופס השליחה..." />}
            {status === "sending" && <SendingOverlay text="שולח את ההודעה..." />}
            {loadError && (
              <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-10 p-6">
                <p className="text-sm text-wine text-center">{loadError}</p>
              </div>
            )}

            <div className="p-5 space-y-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-ink-soft mb-1">נמענים</label>
                <div className="flex flex-wrap items-center gap-1.5 border border-line rounded-lg p-2 min-h-[42px]">
                  {recipients.map((email) => (
                    <span key={email} className="flex items-center gap-1 bg-parchment rounded-full pl-1 pr-2.5 py-1 text-xs">
                      {email}
                      <button
                        type="button"
                        onClick={() => removeRecipient(email)}
                        className="w-4 h-4 rounded-full hover:bg-line flex items-center justify-center text-[10px]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={recipientInput}
                    disabled={formDisabled}
                    onChange={(e) => handleRecipientInputChange(e.target.value)}
                    onFocus={() => setShowSuggestions(suggestions.length > 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addRecipientEmail(recipientInput);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowSuggestions(false), 150);
                      addRecipientEmail(recipientInput);
                    }}
                    placeholder="הוסף כתובת דוא&quot;ל, או חפש איש קשר..."
                    className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {suggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addRecipientEmail(c.email)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-parchment text-right"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold truncate">{c.name || c.email}</span>
                          <span className="block text-xs text-ink-soft truncate" dir="ltr">
                            {c.email}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {recipientError && <p className="text-xs text-wine mt-1">{recipientError}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">כותרת ההודעה</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={formDisabled} className="in text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">תוכן ההודעה</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={formDisabled}
                  rows={6}
                  className="in text-sm min-h-[120px]"
                />
              </div>

              {paymentHubs.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">קישור תשלום (אופציונלי)</label>
                  <SelectDropdown
                    value={paymentHub}
                    onChange={setPaymentHub}
                    options={[{ value: "", label: "ללא קישור תשלום" }, ...paymentHubs.map((p) => ({ value: p.hub, label: p.hub }))]}
                  />
                </div>
              )}

              {status === "error" && <p className="text-sm text-wine">{errorMsg}</p>}

              <button
                type="button"
                onClick={handleSend}
                disabled={formDisabled || status === "sending"}
                className="w-full bg-brass hover:bg-brass-deep text-white font-semibold rounded-full py-2.5 text-sm disabled:opacity-60"
              >
                {status === "sending" ? "שולח..." : `שליחת ${title}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
