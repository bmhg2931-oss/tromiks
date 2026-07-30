"use client";

import { Fragment, useEffect, useState } from "react";
import type { ContactHistoryRow } from "@/app/(app)/contacts/history-actions";
import { fetchContactActivityLog, type ContactActivityLogRow } from "@/app/(app)/contacts/activity-log-actions";
import type { Contact } from "@/lib/types";
import { describeHebrewDate, parseLocalISODate } from "@/lib/hebrewDate";
import AddDonationModal from "./AddDonationModal";
import CreateCreditModal from "./CreateCreditModal";
import ContactReportModal from "./ContactReportModal";
import ContactTasksPanel from "./ContactTasksPanel";
import { DonationPlusIcon } from "./icons";

type NamedItem = { id: string; name: string };

function formatGregorianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatGregorianDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

function hebrewDateLabel(date: Date): string {
  return describeHebrewDate(date).hebrewDate;
}

function weekdayParshaLabel(date: Date): string {
  const { weekday, parsha } = describeHebrewDate(date);
  return `יום ${weekday}${parsha ? ` | ${parsha}` : ""}`;
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return null;
  return `${currency ?? ""}${Number(amount).toLocaleString("he-IL")}`;
}

function activityLine(r: ContactHistoryRow): string {
  const debit = money(r.debitAmount, r.debitCurrency);
  const credit = money(r.creditAmount, r.creditCurrency);
  if (r.recordType === "combined") return `התחייבות ותשלום — חובה ${debit} · זכות ${credit}`;
  if (r.recordType === "pledge") return `התחייבות — ${debit}`;
  if (r.paymentMethod === "זיכוי") return `זיכוי — ${credit}`;
  return `תשלום — ${credit}`;
}

function CreditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 5v6M5.5 6.7c0-1 1-1.7 2.5-1.7s2.5.6 2.5 1.5c0 2-5 1-5 3 0 .9 1 1.5 2.5 1.5s2.5-.7 2.5-1.7" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="1.5" width="10" height="13" rx="1" />
      <path d="M5.5 5h5M5.5 7.7h5M5.5 10.4h3" />
    </svg>
  );
}

type UnifiedEntry = {
  id: string;
  sortTs: number;
  dateLabel: string;
  hebrewLabel: string;
  weekdayParshaLabel: string;
  description: string;
  details: string | null;
  actorName: string | null;
};

export default function ContactActivityTab({
  rows,
  error,
  contact,
  categories,
  handlers,
  defaultHub,
  defaultCurrency,
  editable,
  onChanged,
}: {
  rows: ContactHistoryRow[] | null;
  error: string | null;
  contact: Contact | null;
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const [showAddDonation, setShowAddDonation] = useState(false);
  const [showCreateCredit, setShowCreateCredit] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [activityLog, setActivityLog] = useState<ContactActivityLogRow[] | null>(null);
  const [activityLogError, setActivityLogError] = useState<string | null>(null);

  async function loadActivityLog(contactId: string) {
    const res = await fetchContactActivityLog(contactId);
    if (res.ok) {
      setActivityLog(res.rows ?? []);
      setActivityLogError(null);
    } else {
      setActivityLogError(res.error ?? "שגיאה בטעינת יומן פעילות");
    }
  }

  useEffect(() => {
    if (contact) loadActivityLog(contact.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  if (error) return <p className="text-sm text-wine">{error}</p>;
  if (!rows) return <p className="text-sm text-ink-soft">טוען פעילות...</p>;

  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = rows.filter((r) => r.followUp && r.followUp <= today);
  const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : "";

  const historyEntries: UnifiedEntry[] = rows.map((r) => {
    const d = parseLocalISODate(r.date);
    return {
      id: `h-${r.id}`,
      sortTs: d.getTime(),
      dateLabel: formatGregorianDate(r.date),
      hebrewLabel: hebrewDateLabel(d),
      weekdayParshaLabel: weekdayParshaLabel(d),
      description: activityLine(r),
      details: [r.category, r.handler ? `מטפל: ${r.handler}` : null, r.notes].filter(Boolean).join(" · ") || null,
      actorName: r.actorName,
    };
  });

  const logEntries: UnifiedEntry[] = (activityLog ?? []).map((l) => {
    const d = new Date(l.date);
    return {
      id: `l-${l.id}`,
      sortTs: d.getTime(),
      dateLabel: formatGregorianDateTime(l.date),
      hebrewLabel: hebrewDateLabel(d),
      weekdayParshaLabel: weekdayParshaLabel(d),
      description: l.action,
      details: l.details,
      actorName: l.actorName,
    };
  });

  const unified = [...historyEntries, ...logEntries].sort((a, b) => b.sortTs - a.sortTs);

  return (
    <div className="space-y-5">
      {editable && contact && (
        <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setShowAddDonation(true)}
            className="flex flex-col items-center justify-center gap-1.5 px-2 py-4 rounded-lg text-xs font-bold border border-line bg-white hover:bg-sage/15 hover:border-sage/40 text-ink transition"
          >
            <DonationPlusIcon />
            <span className="text-center leading-tight">הוספת תרומה</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateCredit(true)}
            className="flex flex-col items-center justify-center gap-1.5 px-2 py-4 rounded-lg text-xs font-bold border border-line bg-white hover:bg-sage/15 hover:border-sage/40 text-ink transition"
          >
            <CreditIcon />
            <span className="text-center leading-tight">יצירת זיכוי</span>
          </button>
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="flex flex-col items-center justify-center gap-1.5 px-2 py-4 rounded-lg text-xs font-bold border border-line bg-white hover:bg-sage/15 hover:border-sage/40 text-ink transition"
          >
            <ReportIcon />
            <span className="text-center leading-tight">הפקת דו&quot;ח מסכם</span>
          </button>
        </div>
      )}

      {contact && <ContactTasksPanel contactId={contact.id} editable={editable} />}

      {needsAttention.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-wine mb-2">דורש תשומת לב</h4>
          <div className="space-y-2">
            {needsAttention.map((r) => (
              <div key={r.id} className="bg-wine/5 border border-wine/30 rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{activityLine(r)}</span>
                  <span className="pill pill-pending text-[11px]">המשך טיפול: {formatGregorianDate(r.followUp!)}</span>
                </div>
                {r.category && <div className="text-xs text-ink-soft mt-1">{r.category}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-ink-soft mb-2">יומן פעילות</h4>
        {activityLogError && <p className="text-xs text-wine mb-2">{activityLogError}</p>}
        {unified.length > 0 ? (
          <div className="grid grid-cols-[135px_160px_1.4fr_0.7fr_170px] gap-x-4 text-sm">
            <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">תאריך</div>
            <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">יום ופרשה</div>
            <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">פעולה</div>
            <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">פרטים</div>
            <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">בוצע ע&quot;י</div>
            {unified.map((e, i) => {
              const rowBorder = i === unified.length - 1 ? "" : "border-b border-dashed border-line/70";
              return (
                <Fragment key={e.id}>
                  <div className={`text-xs text-ink-soft whitespace-nowrap leading-tight py-1.5 ${rowBorder}`}>
                    <div>{e.dateLabel}</div>
                    <div className="text-[10px]">{e.hebrewLabel}</div>
                  </div>
                  <div className={`text-xs text-ink-soft py-1.5 ${rowBorder}`}>{e.weekdayParshaLabel}</div>
                  <div className={`py-1.5 ${rowBorder}`}>{e.description}</div>
                  <div className={`text-xs text-ink-soft py-1.5 ${rowBorder}`}>{e.details || "—"}</div>
                  <div className={`text-xs text-ink-soft py-1.5 ${rowBorder}`}>{e.actorName || "—"}</div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">אין פעילות רשומה עדיין</p>
        )}
      </div>

      {showAddDonation && contact && (
        <AddDonationModal
          open={showAddDonation}
          onOpenChange={(v) => {
            setShowAddDonation(v);
            if (!v) onChanged();
          }}
          presetContact={contact}
          categories={categories}
          handlers={handlers}
          defaultHub={defaultHub}
          defaultCurrency={defaultCurrency}
        />
      )}

      {showCreateCredit && contact && (
        <CreateCreditModal
          contactId={contact.id}
          onClose={() => setShowCreateCredit(false)}
          onCreated={() => {
            setShowCreateCredit(false);
            onChanged();
          }}
        />
      )}

      {showReport && contact && (
        <ContactReportModal
          contactId={contact.id}
          contactName={contactName}
          onClose={() => {
            setShowReport(false);
            loadActivityLog(contact.id);
          }}
        />
      )}
    </div>
  );
}
