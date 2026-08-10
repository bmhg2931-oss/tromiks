"use client";

import { useEffect, useState } from "react";
import {
  listContactHebrewDates,
  createContactHebrewDate,
  deleteContactHebrewDate,
} from "@/app/(app)/contacts/hebrew-dates-actions";
import { HEBREW_MONTH_NAMES } from "@/lib/hebrewDate";
import { HEBREW_DATE_TYPES, type ContactHebrewDate, type HebrewDateType } from "@/lib/types";

const HEBREW_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const HEBREW_MONTH_KEYS = Object.keys(HEBREW_MONTH_NAMES);

function dateLabel(d: ContactHebrewDate): string {
  const month = HEBREW_MONTH_NAMES[d.hebrew_month] ?? d.hebrew_month;
  return `${d.hebrew_day} ${month}${d.hebrew_year ? ` ${d.hebrew_year}` : ""}`;
}

// אותו דפוס אינטראקציה בדיוק כמו ContactTasksPanel.tsx - רשימה + טופס-הוספה
// מוטמע (לא modal נפרד), תמיד מוצג בטאב "פרטי איש קשר" בלי קשר למצב עריכה/תצוגה
export default function ContactHebrewDatesSection({ contactId, editable }: { contactId: string; editable: boolean }) {
  const [dates, setDates] = useState<ContactHebrewDate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [hebrewDay, setHebrewDay] = useState(1);
  const [hebrewMonth, setHebrewMonth] = useState(HEBREW_MONTH_KEYS[0]);
  const [hebrewYear, setHebrewYear] = useState("");
  const [dateType, setDateType] = useState<HebrewDateType>("יארצייט");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    const res = await listContactHebrewDates(contactId);
    if (res.ok) {
      setDates(res.dates ?? []);
      setError(null);
    } else {
      setError(res.error ?? "שגיאה בטעינת התאריכון");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  function openForm() {
    setHebrewDay(1);
    setHebrewMonth(HEBREW_MONTH_KEYS[0]);
    setHebrewYear("");
    setDateType("יארצייט");
    setDetails("");
    setFormError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    const res = await createContactHebrewDate(contactId, {
      hebrewDay,
      hebrewMonth,
      hebrewYear: hebrewYear ? Number(hebrewYear) : null,
      dateType,
      details: details.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error ?? "שגיאה בשמירת התאריך");
      return;
    }
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await deleteContactHebrewDate(id, contactId);
    load();
  }

  if (error) return <p className="text-xs text-wine">{error}</p>;

  return (
    <div>
      <h3 className="font-serif text-base font-bold mb-3 pb-2 border-b border-line flex items-center justify-between">
        תאריכון
        {editable && !showForm && (
          <button type="button" onClick={openForm} className="text-xs font-semibold text-brass hover:text-brass-deep">
            + הוספת תאריך
          </button>
        )}
      </h3>

      {showForm && (
        <div className="border border-line rounded-lg p-3 mb-3 space-y-2 bg-parchment/30">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-ink-soft mb-0.5">יום</label>
              <select value={hebrewDay} onChange={(e) => setHebrewDay(Number(e.target.value))} className="in text-sm">
                {HEBREW_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-0.5">חודש</label>
              <select value={hebrewMonth} onChange={(e) => setHebrewMonth(e.target.value)} className="in text-sm">
                {HEBREW_MONTH_KEYS.map((m) => (
                  <option key={m} value={m}>
                    {HEBREW_MONTH_NAMES[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-0.5">שנה (אופציונלי)</label>
              <input type="number" value={hebrewYear} onChange={(e) => setHebrewYear(e.target.value)} className="in text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-ink-soft mb-0.5">סוג</label>
              <select value={dateType} onChange={(e) => setDateType(e.target.value as HebrewDateType)} className="in text-sm">
                {HEBREW_DATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-0.5">פרטים</label>
              <input type="text" value={details} onChange={(e) => setDetails(e.target.value)} className="in text-sm" />
            </div>
          </div>
          {formError && <p className="text-xs text-wine">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-brass hover:bg-brass-deep text-white text-xs font-semibold rounded-full px-4 py-1.5 disabled:opacity-60"
            >
              {saving ? "שומר..." : "שמירה"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs font-semibold text-ink-soft hover:text-ink px-2">
              ביטול
            </button>
          </div>
        </div>
      )}

      {dates === null ? (
        <p className="text-xs text-ink-soft">טוען תאריכון...</p>
      ) : dates.length > 0 ? (
        <div className="space-y-1.5">
          {dates.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 border border-line/70 rounded-lg px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-semibold">{d.date_type}</span>
                <span className="text-xs text-ink-soft"> · {dateLabel(d)}</span>
                {d.details && <span className="text-xs text-ink-soft"> · {d.details}</span>}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => handleDelete(d.id)}
                  className="text-xs font-semibold text-wine hover:underline shrink-0"
                >
                  מחיקה
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-soft">אין תאריכים רשומים</p>
      )}
    </div>
  );
}
