"use client";

import { useEffect, useState, useTransition } from "react";
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

export default function CampaignContactPanel({
  campaignId,
  contactId,
  contactName,
  initialNotes,
  onClose,
}: {
  campaignId: string;
  contactId: string;
  contactName: string;
  initialNotes: string;
  onClose: () => void;
}) {
  const [calls, setCalls] = useState<CampaignCallLogRow[] | null>(null);
  const [reminders, setReminders] = useState<CampaignReminderRow[] | null>(null);
  const [crossCampaign, setCrossCampaign] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl font-bold">{contactName}</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment"
          >
            ×
          </button>
        </div>

        {error && <p className="text-sm text-wine mb-3">{error}</p>}

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

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-serif text-base font-bold">תיעוד שיחות</h3>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" checked={crossCampaign} onChange={(e) => setCrossCampaign(e.target.checked)} />
              הצג היסטוריה מכל הקמפיינים
            </label>
          </div>
          <form
            action={(fd) => {
              handleAddCall(fd);
            }}
            className="flex items-end gap-2 mb-3"
          >
            <div className="flex-1">
              <label className="block text-[11px] text-ink-soft mb-0.5">תוצאת השיחה</label>
              <input name="outcome" className="in" placeholder="לדוגמה: לא ענה / הבטיח לחשוב" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-ink-soft mb-0.5">הערות</label>
              <input name="notes" className="in" />
            </div>
            <button type="submit" disabled={pending} className="h-[38px] px-3 rounded-lg bg-brass hover:bg-brass-deep text-white text-xs transition disabled:opacity-60">
              רישום שיחה
            </button>
          </form>
          {calls === null ? (
            <p className="text-xs text-ink-soft">טוען...</p>
          ) : calls.length === 0 ? (
            <p className="text-xs text-ink-soft">אין עדיין שיחות מתועדות.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {calls.map((c) => (
                <div key={c.id} className="border border-line rounded-lg p-2 text-xs">
                  <div className="flex justify-between text-ink-soft mb-0.5">
                    <span>{new Date(c.call_date).toLocaleString("he-IL")}</span>
                    {crossCampaign && <span className="font-semibold">{c.campaignName}</span>}
                  </div>
                  {c.outcome && <div className="font-semibold">{c.outcome}</div>}
                  {c.notes && <div>{c.notes}</div>}
                </div>
              ))}
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
    </div>,
    document.body
  );
}
