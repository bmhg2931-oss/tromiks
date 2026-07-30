import { createClient } from "@/lib/supabase/server";
import { type UserRole } from "@/lib/types";
import { fetchAllRows } from "@/lib/fetchAllRows";
import VisibilityRulesManager from "@/components/VisibilityRulesManager";
import { listVisibilityRules } from "../visibility-actions";

export default async function ContactVisibilitySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;

  if (role !== "admin") {
    return <p className="text-sm text-wine">רק מנהל מערכת יכול לנהל כללי הרשאה אלו.</p>;
  }

  const [{ rules }, { data: profiles }, { data: tagRows }] = await Promise.all([
    listVisibilityRules(),
    supabase.from("profiles").select("id, full_name"),
    fetchAllRows<{ tags: string[] | null }>(() => supabase.from("contacts").select("tags").is("deleted_at", null)),
  ]);

  const availableTags = Array.from(new Set(tagRows.flatMap((r) => r.tags ?? []))).sort((a, b) => a.localeCompare(b, "he"));

  return (
    <div>
      <h2 className="font-serif text-lg font-bold mb-1">הרשאות צפייה לפי תגית</h2>
      <p className="text-sm text-ink-soft mb-4">
        הגדירו כללים שמגבילים צפייה באנשי קשר בעלי תגית מסוימת - עבור תפקיד שלם או משתמש ספציפי. ניתן להסתיר את
        כרטיס איש הקשר כולו (חסימה מלאה, ברמת מסד הנתונים), או רק חלק מהשדות שלו (מוסתר בתצוגה הרגילה; שאר השדות
        יישארו גלויים כרגיל).
      </p>
      <VisibilityRulesManager rules={rules ?? []} availableTags={availableTags} profiles={profiles ?? []} />
    </div>
  );
}
