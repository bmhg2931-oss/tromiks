"use server";

import { createClient } from "@/lib/supabase/server";
import { computeContactRestrictions, redactContactFields, type FieldVisibilityRule } from "@/lib/contactVisibility";
import type { Contact, UserRole } from "@/lib/types";

type ViewResult = { ok: boolean; contact?: Contact; hasRedactions?: boolean; hiddenSections?: string[]; error?: string };

// שולף איש קשר יחיד לתצוגה/עריכה תוך אכיפת כללי הסתרת שדות/אזורים (ר' lib/contactVisibility.ts):
// שדות מוסתרים מתאפסים בשרת ולעולם אינם נשלחים ללקוח. hasRedactions מאותת לממשק לעבור
// לתצוגת קריאה בלבד (כדי שמשתמש לא ידרוס בטעות שדה שהוא לא רואה), ו-hiddenSections מאותת
// אילו לשוניות (תרומות/קבצים) יש להסתיר לגמרי מהמשתמש הנוכחי עבור איש קשר זה
export async function fetchContactForView(id: string): Promise<ViewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const [{ data: contact, error }, { data: profile }, { data: rules }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", id).single(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("contact_visibility_rules")
      .select("tag, scope_type, role, user_id, hide_contact, hidden_fields, hidden_sections"),
  ]);
  if (error || !contact) return { ok: false, error: error?.message ?? "איש הקשר לא נמצא" };

  const role = (profile?.role ?? "secretary") as UserRole;
  const { hiddenFields, hiddenSections } = computeContactRestrictions(
    contact as Contact,
    (rules ?? []) as FieldVisibilityRule[],
    user.id,
    role
  );
  const redacted = redactContactFields(contact as Contact, hiddenFields);
  return { ok: true, contact: redacted, hasRedactions: hiddenFields.size > 0, hiddenSections: Array.from(hiddenSections) };
}
