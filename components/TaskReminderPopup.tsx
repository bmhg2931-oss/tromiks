"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canEditContacts, type UserRole } from "@/lib/types";
import ContactDetailPanel from "./ContactDetailPanel";
import {
  listDueTasksForCurrentUser,
  snoozeContactTask,
  dismissContactTask,
  type DueTaskPopup,
} from "@/app/(app)/contacts/task-actions";

const POLL_MS = 90_000;

function formatDueLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

function BellIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 16v-5a6 6 0 0 0-5-5.917V4a1 1 0 1 0-2 0v1.083A6 6 0 0 0 6 11v5l-1.5 2.5h15L18 16Z" />
      <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

export default function TaskReminderPopup() {
  const [queue, setQueue] = useState<DueTaskPopup[]>([]);
  const [busy, setBusy] = useState(false);
  const [editable, setEditable] = useState(false);
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setEditable(canEditContacts((profile?.role ?? "secretary") as UserRole));
    })();
  }, []);

  async function poll() {
    const res = await listDueTasksForCurrentUser();
    if (res.ok) {
      setQueue((prev) => {
        const prevIds = new Set(prev.map((t) => t.id));
        const fresh = (res.tasks ?? []).filter((t) => !prevIds.has(t.id));
        return [...prev, ...fresh];
      });
    }
  }

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = queue[0];

  function advance() {
    setQueue((q) => q.slice(1));
  }

  async function handleSnooze(minutes: number) {
    if (!current) return;
    setBusy(true);
    await snoozeContactTask(current.id, minutes);
    setBusy(false);
    advance();
  }

  async function handleDismiss() {
    if (!current) return;
    setBusy(true);
    await dismissContactTask(current.id);
    setBusy(false);
    advance();
  }

  const contactModal = openContactId && (
    <ContactDetailPanel id={openContactId} editable={editable} initialTab="activity" onClose={() => setOpenContactId(null)} />
  );

  if (!current) return contactModal ?? null;

  return (
    <>
    <div className="fixed bottom-5 right-5 z-[80] w-[21rem] bg-white border border-line rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-11 h-11 rounded-full bg-sage/15 text-sage flex items-center justify-center shrink-0">
          <BellIcon />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h4 className="text-xs font-bold text-ink-soft mb-1">תזכורת</h4>
          <p className="text-sm font-semibold leading-snug">{current.title}</p>
          <p className="text-xs text-ink-soft mt-1">
            {current.contactName} · יעד: {formatDueLabel(current.dueAt)}
          </p>
          <button
            type="button"
            onClick={() => setOpenContactId(current.contactId)}
            className="text-xs text-brass hover:text-brass-deep font-semibold mt-2"
          >
            מעבר לאיש קשר ←
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-4 pb-4">
        <button
          type="button"
          onClick={() => handleSnooze(15)}
          disabled={busy}
          className="border border-line text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-parchment disabled:opacity-60"
        >
          נודניק · 15 דק&apos;
        </button>
        <button
          type="button"
          onClick={() => handleSnooze(60)}
          disabled={busy}
          className="border border-line text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-parchment disabled:opacity-60"
        >
          נודניק · שעה
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={busy}
          className="text-xs text-ink-soft hover:text-ink font-semibold rounded-full px-3 py-1.5 mr-auto disabled:opacity-60"
        >
          אל תציג שוב
        </button>
      </div>
      {queue.length > 1 && (
        <p className="text-[11px] text-ink-soft bg-parchment/50 px-4 py-1.5 border-t border-line">
          עוד {queue.length - 1} תזכורות ממתינות
        </p>
      )}
    </div>
    {contactModal}
    </>
  );
}
