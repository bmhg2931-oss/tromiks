"use server";

import { createClient } from "@/lib/supabase/server";
import { logContactActivity } from "@/lib/activityLog";
import type { ContactTask } from "@/lib/types";

export type ContactTaskRow = ContactTask & { assigneeName: string | null };

type TaskResult = { ok: boolean; error?: string };

export async function listAssignableUsers(): Promise<{ ok: boolean; users?: { id: string; name: string }[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").eq("approved", true).order("full_name");
  if (error) return { ok: false, error: error.message };
  return { ok: true, users: (data ?? []).map((p) => ({ id: p.id, name: p.full_name || "" })) };
}

export async function listContactTasks(contactId: string): Promise<{ ok: boolean; tasks?: ContactTaskRow[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tasks")
    .select("*")
    .eq("contact_id", contactId)
    .order("due_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const assignedIds = Array.from(new Set((data ?? []).map((t) => t.assigned_to).filter(Boolean))) as string[];
  const names = new Map<string, string | null>();
  if (assignedIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", assignedIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name);
  }

  const tasks = (data ?? []).map((t) => ({ ...(t as ContactTask), assigneeName: t.assigned_to ? names.get(t.assigned_to) ?? null : null }));
  return { ok: true, tasks };
}

export async function createContactTask(
  contactId: string,
  input: { title: string; dueAt: string; assignedTo: string | null }
): Promise<TaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "יש להזין כותרת למשימה" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("contact_tasks").insert({
    contact_id: contactId,
    title,
    due_at: input.dueAt,
    assigned_to: input.assignedTo,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  await logContactActivity(contactId, `נוצרה תזכורת: ${title}`);
  return { ok: true };
}

export async function updateContactTask(
  taskId: string,
  contactId: string,
  input: { title: string; dueAt: string; assignedTo: string | null }
): Promise<TaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "יש להזין כותרת למשימה" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tasks")
    .update({ title, due_at: input.dueAt, assigned_to: input.assignedTo })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await logContactActivity(contactId, `עודכנה תזכורת: ${title}`);
  return { ok: true };
}

export async function completeContactTask(taskId: string, contactId: string, title: string): Promise<TaskResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tasks")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await logContactActivity(contactId, `הושלמה תזכורת: ${title}`);
  return { ok: true };
}

export async function snoozeContactTask(taskId: string, minutes: number): Promise<TaskResult> {
  const supabase = await createClient();
  const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error } = await supabase.from("contact_tasks").update({ snoozed_until: snoozedUntil }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// "אל תציג שוב" - משתיק רק את הפופ-אפ (הודעת התזכורת הקופצת), המשימה עצמה
// נשארת ברשימת המשימות של איש הקשר עד שמישהו מסמן אותה כהושלמה בפועל
export async function dismissContactTask(taskId: string): Promise<TaskResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_tasks").update({ dismissed: true }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// נקרא אחרי אישור חלונית "נקבע המשך טיפול ל..." בזרימות התחייבות/התחייבות ותשלום -
// יוצר תזכורת אוטומטית בכרטיס הלקוח, עם שיוך למשתמש לפי שם המטפל (אם קיים משתמש
// בשם הזה - ר' סנכרון donation_handlers מול profiles.full_name בסכמה)
export async function createFollowUpTask(
  contactId: string,
  input: { title: string; dueAt: string; handlerName: string | null }
): Promise<TaskResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let assignedTo: string | null = null;
  if (input.handlerName) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("full_name", input.handlerName).maybeSingle();
    assignedTo = profile?.id ?? null;
  }

  const { error } = await supabase.from("contact_tasks").insert({
    contact_id: contactId,
    title: input.title,
    due_at: input.dueAt,
    assigned_to: assignedTo,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  await logContactActivity(contactId, "נקבעה תזכורת המשך טיפול", input.title);
  return { ok: true };
}

export type DueTaskPopup = { id: string; title: string; dueAt: string; contactId: string; contactName: string };

// נקרא ע"י הפולר הגלובלי (בכל מסך במערכת) - משימות שהתאריך שלהן הגיע, ששויכו
// למשתמש הנוכחי (או שהוא יצר בלי לשייך לאף אחד), עדיין לא הושלמו/הושתקו,
// ולא נמצאות בדחיית "נודניק" פעילה
export async function listDueTasksForCurrentUser(): Promise<{ ok: boolean; tasks?: DueTaskPopup[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, tasks: [] };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("contact_tasks")
    .select("id, title, due_at, contact_id, assigned_to, created_by, contacts(first_name, last_name)")
    .eq("completed", false)
    .eq("dismissed", false)
    .lte("due_at", nowIso)
    .or(`assigned_to.eq.${user.id},and(assigned_to.is.null,created_by.eq.${user.id})`)
    .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
  if (error) return { ok: false, error: error.message };

  const tasks = (data ?? []).map((t) => {
    const c = t.contacts as unknown as { first_name: string; last_name: string } | null;
    return {
      id: t.id,
      title: t.title,
      dueAt: t.due_at,
      contactId: t.contact_id,
      contactName: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "",
    };
  });
  return { ok: true, tasks };
}
