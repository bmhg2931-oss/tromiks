"use client";

import { useState } from "react";
import { updatePledgeFollowUp } from "@/app/(app)/donations/pledge-actions";
import { createFollowUpTask } from "@/app/(app)/contacts/task-actions";
import { describeHebrewDate, parseLocalISODate } from "@/lib/hebrewDate";

type NamedItem = { id: string; name: string };

function formatGregorianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function FollowUpConfirmModal({
  contactId,
  pledgeId,
  followUp,
  handler,
  category,
  details,
  handlers,
  onDone,
}: {
  contactId: string;
  pledgeId: string;
  followUp: string;
  handler: string | null;
  category: string | null;
  details: string | null;
  handlers: NamedItem[];
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(followUp);
  const [handlerName, setHandlerName] = useState(handler ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hebrew = describeHebrewDate(parseLocalISODate(date));
  const dateLine = `${formatGregorianDate(date)} | ${hebrew.hebrewDate} | יום ${hebrew.weekday}${hebrew.parsha ? ` | ${hebrew.parsha}` : ""}`;

  async function handleSaveFix() {
    if (!date) {
      setError("יש לבחור תאריך");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updatePledgeFollowUp(pledgeId, date, handlerName || null);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "שגיאה בעדכון");
      return;
    }
    setEditing(false);
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const title = ["המשך טיפול", category, details].filter(Boolean).join(" - ");
    const res = await createFollowUpTask(contactId, {
      title: title || "המשך טיפול",
      dueAt: new Date(`${date}T09:00:00`).toISOString(),
      handlerName: handlerName || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "שגיאה ביצירת התזכורת");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-sm w-full p-6 text-center space-y-4">
        {!editing ? (
          <>
            <h3 className="font-serif text-lg font-bold">נקבע המשך טיפול</h3>
            <p className="text-sm">
              ל-<b>{dateLine}</b>
              <br />
              ע&quot;י <b>{handlerName || "לא משויך"}</b>
            </p>
            {error && <p className="text-xs text-wine">{error}</p>}
            <div className="flex justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-line text-sm hover:bg-parchment disabled:opacity-60"
              >
                תיקון
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-6 py-2 text-sm disabled:opacity-60"
              >
                {saving ? "מאשר..." : "אישור"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-serif text-lg font-bold">תיקון המשך טיפול</h3>
            <div className="text-right space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">תאריך המשך טיפול</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="in text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">המשך טיפול על ידי</label>
                <select value={handlerName} onChange={(e) => setHandlerName(e.target.value)} className="in text-sm">
                  <option value="">ללא</option>
                  {handlerName && !handlers.some((h) => h.name === handlerName) && <option value={handlerName}>{handlerName}</option>}
                  {handlers.map((h) => (
                    <option key={h.id} value={h.name}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-wine">{error}</p>}
            <div className="flex justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-line text-sm hover:bg-parchment disabled:opacity-60"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSaveFix}
                disabled={saving}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-6 py-2 text-sm disabled:opacity-60"
              >
                {saving ? "שומר..." : "שמירה"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
