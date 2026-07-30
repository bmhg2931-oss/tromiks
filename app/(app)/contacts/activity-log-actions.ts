"use server";

import { createClient } from "@/lib/supabase/server";
import { logContactActivity } from "@/lib/activityLog";
import { fetchContactHistory } from "./history-actions";
import { computeReportBalances } from "@/lib/reportTemplate";

export type ContactActivityLogRow = { id: string; date: string; action: string; details: string | null; actorName: string | null };

export async function fetchContactActivityLog(contactId: string): Promise<{ ok: boolean; rows?: ContactActivityLogRow[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_activity_log")
    .select("id, action, details, created_at, actor_id")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
  const actorNames = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of profiles ?? []) actorNames.set(p.id, p.full_name);
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    date: r.created_at,
    action: r.action,
    details: r.details,
    actorName: r.actor_id ? actorNames.get(r.actor_id) ?? null : null,
  }));
  return { ok: true, rows };
}

// נקרא מהלקוח בעת פתיחת כרטיס איש קשר - מתעד גם צפייה בכרטיס (לא רק עריכה),
// לצורך יומן הפעילות הכללי של המערכת (הגדרות > יומן פעילות מערכת, מנהלים בלבד)
export async function logContactView(contactId: string): Promise<void> {
  await logContactActivity(contactId, "צפייה בכרטיס איש קשר");
}

// נקרא מהלקוח בלחיצה על "הדפסה" (window.print() בצד הלקוח, ללא קריאת שרת קיימת
// שאפשר "לתפוס" בדרך אחרת) - כדי לתעד גם פעולת הדפסה ביומן הפעילות, כולל תמונת
// מצב של היתרה הפתוחה באותו רגע
export async function logReportPrint(contactId: string, title: string): Promise<void> {
  const historyRes = await fetchContactHistory(contactId);
  let details: string | null = null;
  if (historyRes.ok) {
    const balances = computeReportBalances(historyRes.rows ?? []).filter((b) => b.balance > 0);
    details =
      balances.length === 0
        ? "אין יתרה פתוחה"
        : `יתרה פתוחה: ${balances.map((b) => `${b.currency}${b.balance.toLocaleString("he-IL")}`).join(", ")}`;
  }
  await logContactActivity(contactId, `הדפסת ${title}`, details);
}
