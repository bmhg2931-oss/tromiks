import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const LIMIT = 300;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function ActivityLogSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const isAdmin = ((myProfile?.role ?? "secretary") as UserRole) === "admin";

  if (!isAdmin) {
    return <p className="text-sm text-wine">עמוד זה זמין למנהלי מערכת בלבד.</p>;
  }

  const { data, error } = await supabase
    .from("contact_activity_log")
    .select("id, action, details, created_at, actor_id, contact_id, contacts(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) return <p className="text-sm text-wine">שגיאה בטעינת יומן הפעילות: {error.message}</p>;

  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
  const actorNames = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of profiles ?? []) actorNames.set(p.id, p.full_name);
  }

  const rows = (data ?? []).map((r) => {
    const c = r.contacts as unknown as { first_name: string; last_name: string } | null;
    return {
      id: r.id,
      dateLabel: formatDateTime(r.created_at),
      contactId: r.contact_id,
      contactName: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "—",
      action: r.action,
      details: r.details,
      actorName: r.actor_id ? actorNames.get(r.actor_id) ?? null : null,
    };
  });

  return (
    <div>
      <h2 className="font-serif text-lg font-bold mb-1">יומן פעילות מערכת</h2>
      <p className="text-sm text-ink-soft mb-4">
        כל הפעולות שבוצעו על אנשי קשר במערכת (כולל צפייה בכרטיס, עדכון פרטים, דו&quot;חות ותזכורות) עם שם המשתמש
        שביצע. מוצגות {rows.length} הפעולות האחרונות.
      </p>

      {rows.length > 0 ? (
        <div className="grid grid-cols-[135px_140px_150px_1fr_170px] gap-x-4 text-sm overflow-x-auto">
          <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">תאריך ושעה</div>
          <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">איש קשר</div>
          <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">פעולה</div>
          <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">פרטים</div>
          <div className="text-xs font-semibold text-ink-soft pb-1.5 border-b border-line">בוצע ע&quot;י</div>
          {rows.map((r, i) => {
            const rowBorder = i === rows.length - 1 ? "" : "border-b border-dashed border-line/70";
            return (
              <Fragment key={r.id}>
                <div className={`text-xs text-ink-soft whitespace-nowrap py-1.5 ${rowBorder}`}>{r.dateLabel}</div>
                <div className={`text-xs py-1.5 ${rowBorder}`}>{r.contactName}</div>
                <div className={`py-1.5 ${rowBorder}`}>{r.action}</div>
                <div className={`text-xs text-ink-soft py-1.5 ${rowBorder}`}>{r.details || "—"}</div>
                <div className={`text-xs text-ink-soft py-1.5 ${rowBorder}`}>{r.actorName || "—"}</div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-soft">אין עדיין פעילות רשומה</p>
      )}
    </div>
  );
}
