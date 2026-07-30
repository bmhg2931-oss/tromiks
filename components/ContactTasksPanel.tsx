"use client";

import { useEffect, useState } from "react";
import {
  listContactTasks,
  createContactTask,
  updateContactTask,
  completeContactTask,
  listAssignableUsers,
  type ContactTaskRow,
} from "@/app/(app)/contacts/task-actions";
import SelectDropdown from "./SelectDropdown";
import { PencilIcon } from "./icons";

function formatDueLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function taskUrgency(dueAt: string, now: number): "overdue" | "due" | "normal" {
  const due = new Date(dueAt).getTime();
  if (now - due > DAY_MS) return "overdue";
  if (due <= now) return "due";
  return "normal";
}

export default function ContactTasksPanel({ contactId, editable }: { contactId: string; editable: boolean }) {
  const [tasks, setTasks] = useState<ContactTaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    const res = await listContactTasks(contactId);
    if (res.ok) {
      setTasks((res.tasks ?? []).filter((t) => !t.completed));
      setError(null);
    } else {
      setError(res.error ?? "שגיאה בטעינת משימות");
    }
  }

  useEffect(() => {
    load();
    listAssignableUsers().then((res) => {
      if (res.ok) setAssignees(res.users ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  function openForm() {
    const in1h = new Date(Date.now() + 60 * 60_000);
    setDueAt(toLocalDatetimeInputValue(in1h));
    setTitle("");
    setAssignedTo("");
    setFormError(null);
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(t: ContactTaskRow) {
    setDueAt(toLocalDatetimeInputValue(new Date(t.due_at)));
    setTitle(t.title);
    setAssignedTo(t.assigned_to ?? "");
    setFormError(null);
    setEditingId(t.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!title.trim()) {
      setFormError("יש להזין כותרת למשימה");
      return;
    }
    if (!dueAt) {
      setFormError("יש לבחור תאריך ושעה");
      return;
    }
    setSaving(true);
    setFormError(null);
    const input = { title, dueAt: new Date(dueAt).toISOString(), assignedTo: assignedTo || null };
    const res = editingId ? await updateContactTask(editingId, contactId, input) : await createContactTask(contactId, input);
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error ?? "שגיאה בשמירת המשימה");
      return;
    }
    setShowForm(false);
    setEditingId(null);
    load();
  }

  async function handleComplete(t: ContactTaskRow) {
    await completeContactTask(t.id, contactId, t.title);
    load();
  }

  if (error) return <p className="text-xs text-wine">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-ink-soft">משימות ותזכורות</h4>
        {editable && (
          <button type="button" onClick={openForm} className="text-xs font-semibold text-brass hover:text-brass-deep">
            + הוספת משימה
          </button>
        )}
      </div>

      {showForm && (
        <div className="border border-line rounded-lg p-3 mb-3 space-y-2 bg-parchment/30">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת המשימה / תזכורת"
            className="in text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="in text-sm" />
            <SelectDropdown
              value={assignedTo}
              onChange={setAssignedTo}
              options={[{ value: "", label: "לא משויך" }, ...assignees.map((a) => ({ value: a.id, label: a.name || "—" }))]}
            />
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
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-xs font-semibold text-ink-soft hover:text-ink px-2"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {tasks === null ? (
        <p className="text-xs text-ink-soft">טוען משימות...</p>
      ) : tasks.length > 0 ? (
        <div className="space-y-1.5">
          {tasks.map((t) => {
            const urgency = taskUrgency(t.due_at, now);
            const urgencyClass = urgency === "overdue" ? "pulse-red border-transparent" : urgency === "due" ? "pulse-orange border-transparent" : "border-line/70";
            return (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm ${urgencyClass}`}
              >
                <div className="min-w-0">
                  <span className="font-semibold">{t.title}</span>
                  <span className="text-xs text-ink-soft"> · יעד: {formatDueLabel(t.due_at)}</span>
                  {t.assigneeName && <span className="text-xs text-ink-soft"> · {t.assigneeName}</span>}
                </div>
                {editable && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditForm(t)}
                      aria-label="עריכת תזכורת"
                      title="עריכת תזכורת"
                      className="w-7 h-7 rounded-full border border-line flex items-center justify-center bg-white/70 hover:bg-white"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleComplete(t)}
                      className="text-xs font-semibold border border-line rounded-full px-3 py-1 bg-white/70 hover:bg-white"
                    >
                      בוצע
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-soft">אין משימות פתוחות</p>
      )}
      <style jsx>{`
        .pulse-orange {
          animation: pulse-orange 1.8s ease-in-out infinite;
        }
        .pulse-red {
          animation: pulse-red 1.8s ease-in-out infinite;
        }
        @keyframes pulse-orange {
          0%,
          100% {
            background-color: rgba(217, 154, 61, 0.08);
          }
          50% {
            background-color: rgba(217, 154, 61, 0.28);
          }
        }
        @keyframes pulse-red {
          0%,
          100% {
            background-color: rgba(155, 42, 42, 0.1);
          }
          50% {
            background-color: rgba(155, 42, 42, 0.3);
          }
        }
      `}</style>
    </div>
  );
}
