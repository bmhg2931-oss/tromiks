"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  addCallLog,
  addReminder,
  completeReminder,
  deleteReminder,
  getCampaignContactActivity,
  type CampaignCallLogRow,
  type CampaignReminderRow,
} from "@/app/(app)/campaigns/call-actions";
import { updateMappingNotes } from "@/app/(app)/campaigns/mapping-actions";
import { sendCampaignEmail } from "@/app/(app)/campaigns/email-actions";
import { getVoiceAccessToken } from "@/app/(app)/campaigns/voice-actions";
import type { Device as TwilioDevice, Call as TwilioCall } from "@twilio/voice-sdk";
import type { CampaignRecordRow } from "./CampaignRecordsTable";
import AddDonationModal from "./AddDonationModal";
import ContactDetailPanel from "./ContactDetailPanel";
import { CallIcon, EmailIcon, FaxIcon, SwapIcon, CardIcon } from "./icons";
import type { Contact } from "@/lib/types";

type NamedItem = { id: string; name: string };
type SwitchOption = { id: string; name: string };

function nowLocalDateTime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fillTemplate(template: string, name: string, campaignName: string) {
  return template.replace(/\{שם\}/g, name).replace(/\{קמפיין\}/g, campaignName);
}

type HistoryItem =
  | { kind: "call"; date: string; call: CampaignCallLogRow }
  | { kind: "record"; date: string; record: CampaignRecordRow };

export default function CampaignContactPanel({
  campaignId,
  campaignName,
  contactId,
  contactName,
  contactPhone,
  contactEmail,
  contactDepartment,
  contactTags,
  editable = false,
  initialNotes,
  onClose,
  showNotesEditor = false,
  mappingSummary,
  records,
  donationProps,
  emailTemplate,
  faxTemplate,
  switchOptions,
  onSwitchContact,
}: {
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string | null;
  contactDepartment?: string | null;
  contactTags?: string[];
  editable?: boolean;
  initialNotes: string;
  onClose: () => void;
  showNotesEditor?: boolean;
  mappingSummary?: { label: string; value: string }[];
  records?: CampaignRecordRow[];
  donationProps?: {
    contact: Contact;
    categories: NamedItem[];
    handlers: NamedItem[];
    defaultHub: string;
    defaultCurrency: string;
    defaultCategory?: string;
  };
  emailTemplate?: string | null;
  faxTemplate?: string | null;
  switchOptions?: SwitchOption[];
  onSwitchContact?: (id: string) => void;
}) {
  const [calls, setCalls] = useState<CampaignCallLogRow[] | null>(null);
  const [reminders, setReminders] = useState<CampaignReminderRow[] | null>(null);
  const [crossCampaign, setCrossCampaign] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddDonation, setShowAddDonation] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [callState, setCallState] = useState<"idle" | "connecting" | "in-call">("idle");
  const deviceRef = useRef<TwilioDevice | null>(null);
  const callRef = useRef<TwilioCall | null>(null);
  const [showContactCard, setShowContactCard] = useState(false);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switchOpen, setSwitchOpen] = useState(false);

  function loadActivity(cross: boolean) {
    getCampaignContactActivity(campaignId, contactId, cross).then((res) => {
      setCalls(res.calls);
      setReminders(res.reminders);
    });
  }

  useEffect(() => {
    loadActivity(crossCampaign);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossCampaign]);

  const history: HistoryItem[] = useMemo(() => {
    const items: HistoryItem[] = [];
    for (const c of calls ?? []) items.push({ kind: "call", date: c.call_date, call: c });
    for (const r of records ?? []) items.push({ kind: "record", date: r.date, record: r });
    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [calls, records]);

  function handleSaveNotes() {
    startTransition(async () => {
      const result = await updateMappingNotes(campaignId, contactId, notes);
      if (!result.ok) setError(result.error ?? "שגיאה בשמירת הערות");
    });
  }

  function handleAddCall(formData: FormData) {
    startTransition(async () => {
      const result = await addCallLog(campaignId, contactId, formData);
      if (!result.ok) setError(result.error ?? "שגיאה בהוספת שיחה");
      else loadActivity(crossCampaign);
    });
  }

  function logChannel(outcome: string) {
    const fd = new FormData();
    fd.set("outcome", outcome);
    startTransition(async () => {
      const result = await addCallLog(campaignId, contactId, fd);
      if (!result.ok) setError(result.error ?? "שגיאה בתיעוד");
      else loadActivity(crossCampaign);
    });
  }

  useEffect(() => {
    return () => {
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  }, []);

  async function handleCall() {
    if (!contactPhone || callState !== "idle") return;
    setError(null);
    setCallState("connecting");
    const tokenResult = await getVoiceAccessToken();
    if (!tokenResult.ok) {
      setError(tokenResult.error);
      setCallState("idle");
      return;
    }
    try {
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(tokenResult.token, {});
      deviceRef.current = device;
      await device.register();
      const call = await device.connect({ params: { To: contactPhone } });
      callRef.current = call;
      call.on("accept", () => setCallState("in-call"));
      call.on("disconnect", () => {
        setCallState("idle");
        deviceRef.current?.destroy();
        deviceRef.current = null;
        callRef.current = null;
      });
      call.on("error", (e: Error) => {
        setError(e.message || "שגיאה בשיחה");
        setCallState("idle");
      });
      logChannel("התקשרות (VoIP)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהתחלת השיחה - ודא/י שהוגדרו משתני הסביבה של Twilio ושאושרה גישה למיקרופון");
      setCallState("idle");
    }
  }

  function handleHangup() {
    callRef.current?.disconnect();
  }

  async function handleEmail() {
    if (!contactEmail || emailSending) return;
    const body = emailTemplate ? fillTemplate(emailTemplate, contactName, campaignName) : "";
    setEmailSending(true);
    setError(null);
    const result = await sendCampaignEmail(contactEmail, campaignName, body);
    setEmailSending(false);
    if (!result.ok) {
      setError(result.error ?? "שגיאה בשליחת המייל");
      return;
    }
    logChannel('נשלח דוא"ל');
  }

  function handleFax() {
    const body = faxTemplate ? fillTemplate(faxTemplate, contactName, campaignName) : "";
    if (body) window.alert(`תוכן הפקס לשליחה:\n\n${body}`);
    logChannel("נשלח פקס");
  }

  function handleAddReminder(formData: FormData) {
    startTransition(async () => {
      const result = await addReminder(campaignId, contactId, formData);
      if (!result.ok) setError(result.error ?? "שגיאה בהוספת תזכורת");
      else loadActivity(crossCampaign);
    });
  }

  function handleCompleteReminder(id: string) {
    startTransition(async () => {
      await completeReminder(id, campaignId);
      loadActivity(crossCampaign);
    });
  }

  function handleDeleteReminder(id: string) {
    startTransition(async () => {
      await deleteReminder(id, campaignId);
      loadActivity(crossCampaign);
    });
  }

  const filteredSwitchOptions = (switchOptions ?? []).filter(
    (o) => o.id !== contactId && (!switchQuery.trim() || o.name.toLowerCase().includes(switchQuery.trim().toLowerCase()))
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-bold">{contactName}</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment"
          >
            ×
          </button>
        </div>

        <div className="mb-5 bg-parchment/50 border border-line rounded-lg p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-xs space-y-0.5">
              {contactPhone && <div>📱 {contactPhone}</div>}
              {contactEmail && <div>{contactEmail}</div>}
              {contactDepartment && <div className="text-ink-soft">{contactDepartment}</div>}
              {contactTags && contactTags.length > 0 && <div className="text-ink-soft">{contactTags.join(", ")}</div>}
            </div>
            <div className="flex items-center gap-2 relative">
              {switchOptions && onSwitchContact && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSwitchOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-line hover:bg-white transition"
                  >
                    <SwapIcon />
                    החלפת איש קשר
                  </button>
                  {switchOpen && (
                    <div className="absolute z-20 top-full mt-1 left-0 w-56 bg-white border border-line rounded-lg shadow-lg p-2">
                      <input
                        type="text"
                        value={switchQuery}
                        onChange={(e) => setSwitchQuery(e.target.value)}
                        placeholder="חיפוש איש קשר..."
                        className="in mb-1.5"
                        autoFocus
                      />
                      <div className="max-h-40 overflow-y-auto">
                        {filteredSwitchOptions.slice(0, 30).map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                              setSwitchOpen(false);
                              setSwitchQuery("");
                              onSwitchContact(o.id);
                            }}
                            className="block w-full text-right px-2 py-1.5 text-xs hover:bg-parchment rounded"
                          >
                            {o.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowContactCard(true)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-line hover:bg-white transition"
              >
                <CardIcon />
                מעבר לכרטיס איש קשר
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-5">
          {callState === "idle" ? (
            <button
              type="button"
              onClick={handleCall}
              disabled={!contactPhone}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-line hover:bg-parchment transition disabled:opacity-40"
            >
              <CallIcon /> התקשרות
            </button>
          ) : (
            <button
              type="button"
              onClick={handleHangup}
              disabled={callState === "connecting"}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-wine/50 bg-wine/10 text-wine transition"
            >
              <CallIcon /> {callState === "connecting" ? "מתחבר..." : "ניתוק"}
            </button>
          )}
          <button
            type="button"
            onClick={handleEmail}
            disabled={!contactEmail || emailSending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-line hover:bg-parchment transition disabled:opacity-40"
          >
            <EmailIcon /> {emailSending ? "שולח..." : "שליחת מייל"}
          </button>
          <button type="button" onClick={handleFax} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-line hover:bg-parchment transition">
            <FaxIcon /> שליחת פקס
          </button>
        </div>

        {donationProps && (
          <div className="flex justify-center mb-6">
            <button
              type="button"
              onClick={() => setShowAddDonation(true)}
              className="bg-brass hover:bg-brass-deep text-white font-bold rounded-full px-8 py-3 text-base shadow transition"
            >
              + הוספת תרומה
            </button>
          </div>
        )}

        {error && <p className="text-sm text-wine mb-3 text-center">{error}</p>}

        {mappingSummary && mappingSummary.length > 0 && (
          <div className="mb-6 bg-parchment/50 border border-line rounded-lg p-3">
            <h3 className="font-serif text-sm font-bold mb-2">סיכום מיפוי</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {mappingSummary.map((m) => (
                <div key={m.label}>
                  <span className="text-ink-soft">{m.label}: </span>
                  <span className="font-semibold">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showNotesEditor && (
          <div className="mb-6">
            <label className="block text-xs font-semibold text-ink-soft mb-1">הערות מיפוי</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="in min-h-[60px] mb-2" />
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-lg bg-brass hover:bg-brass-deep text-white transition disabled:opacity-60"
            >
              שמירת הערות
            </button>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-serif text-base font-bold">היסטוריית התרמה</h3>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" checked={crossCampaign} onChange={(e) => setCrossCampaign(e.target.checked)} />
              הצג היסטוריה מכל הקמפיינים
            </label>
          </div>
          <form
            action={(fd) => {
              handleAddCall(fd);
            }}
            className="flex items-end gap-2 mb-3 flex-wrap"
          >
            <div>
              <label className="block text-[11px] text-ink-soft mb-0.5">תאריך השיחה</label>
              <input type="datetime-local" name="call_date" defaultValue={nowLocalDateTime()} className="in" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-ink-soft mb-0.5">תוצאת השיחה</label>
              <input name="outcome" className="in" placeholder="לדוגמה: לא ענה / הבטיח לחשוב" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-ink-soft mb-0.5">הערות</label>
              <input name="notes" className="in" />
            </div>
            <button type="submit" disabled={pending} className="h-[38px] px-3 rounded-lg bg-brass hover:bg-brass-deep text-white text-xs transition disabled:opacity-60">
              רישום שיחה
            </button>
          </form>

          {calls === null ? (
            <p className="text-xs text-ink-soft">טוען...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-ink-soft">אין עדיין היסטוריה מתועדת.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((item) =>
                item.kind === "call" ? (
                  <div key={`call-${item.call.id}`} className="border border-line rounded-lg p-2 text-xs">
                    <div className="flex justify-between text-ink-soft mb-0.5">
                      <span>{new Date(item.call.call_date).toLocaleString("he-IL")} · שיחה</span>
                      {crossCampaign && <span className="font-semibold">{item.call.campaignName}</span>}
                    </div>
                    {item.call.outcome && <div className="font-semibold">{item.call.outcome}</div>}
                    {item.call.notes && <div>{item.call.notes}</div>}
                  </div>
                ) : (
                  <div key={`record-${item.record.id}`} className="border border-line rounded-lg p-2 text-xs bg-parchment/30">
                    <div className="text-ink-soft mb-0.5">
                      {new Date(item.record.date).toLocaleDateString("he-IL")} · {item.record.type === "pledge" ? "התחייבות" : "תשלום"}
                    </div>
                    <div className="font-semibold">
                      {item.record.currency}
                      {Number(item.record.amount).toLocaleString("he-IL")}
                      {item.record.category && ` · ${item.record.category}`}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-serif text-base font-bold mb-2">תזכורות</h3>
          <form
            action={(fd) => {
              handleAddReminder(fd);
            }}
            className="flex items-end gap-2 mb-3"
          >
            <div>
              <label className="block text-[11px] text-ink-soft mb-0.5">תאריך</label>
              <input type="date" name="due_date" required className="in" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-ink-soft mb-0.5">פעולה נדרשת</label>
              <input name="note" className="in" />
            </div>
            <button type="submit" disabled={pending} className="h-[38px] px-3 rounded-lg bg-brass hover:bg-brass-deep text-white text-xs transition disabled:opacity-60">
              הוספת תזכורת
            </button>
          </form>
          {reminders === null ? (
            <p className="text-xs text-ink-soft">טוען...</p>
          ) : reminders.length === 0 ? (
            <p className="text-xs text-ink-soft">אין תזכורות פתוחות.</p>
          ) : (
            <div className="space-y-1.5">
              {reminders.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between border border-line rounded-lg p-2 text-xs ${r.completed ? "opacity-50" : ""}`}
                >
                  <div>
                    <span className="font-semibold">{new Date(r.due_date).toLocaleDateString("he-IL")}</span>
                    {r.note && <span> · {r.note}</span>}
                  </div>
                  <div className="flex gap-1">
                    {!r.completed && (
                      <button
                        type="button"
                        onClick={() => handleCompleteReminder(r.id)}
                        className="text-sage hover:underline"
                      >
                        בוצע
                      </button>
                    )}
                    <button type="button" onClick={() => handleDeleteReminder(r.id)} className="text-wine hover:underline">
                      מחיקה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {donationProps && (
        <div onClick={(e) => e.stopPropagation()}>
          <AddDonationModal
            open={showAddDonation}
            onOpenChange={setShowAddDonation}
            presetContact={donationProps.contact}
            categories={donationProps.categories}
            handlers={donationProps.handlers}
            defaultHub={donationProps.defaultHub}
            defaultCurrency={donationProps.defaultCurrency}
            defaultCategory={donationProps.defaultCategory}
          />
        </div>
      )}

      {showContactCard && (
        <div onClick={(e) => e.stopPropagation()}>
          <ContactDetailPanel id={contactId} editable={editable} onClose={() => setShowContactCard(false)} />
        </div>
      )}
    </div>,
    document.body
  );
}
