import type { Contact } from "./types";

export type FieldVisibilityRule = {
  tag: string;
  scope_type: "role" | "user";
  role: string | null;
  user_id: string | null;
  hide_contact: boolean;
  hidden_fields: string[] | null;
  hidden_sections: string[] | null;
};

// מוצא את כל הכללים הרלוונטיים למשתמש/תפקיד הנוכחי על סמך תגיות איש הקשר (לא כולל
// כללי "hide_contact" - אלו נאכפים ב-RLS ולא צריכים טיפול כאן). מנהל מערכת פטור תמיד.
function applicableRules(tags: string[], rules: FieldVisibilityRule[], currentUserId: string, currentRole: string) {
  if (currentRole === "admin") return [];
  return rules.filter(
    (r) =>
      !r.hide_contact &&
      tags.includes(r.tag) &&
      ((r.scope_type === "role" && r.role === currentRole) || (r.scope_type === "user" && r.user_id === currentUserId))
  );
}

export function computeContactRestrictions(
  contact: Pick<Contact, "tags">,
  rules: FieldVisibilityRule[],
  currentUserId: string,
  currentRole: string
): { hiddenFields: Set<string>; hiddenSections: Set<string> } {
  const applicable = applicableRules(contact.tags ?? [], rules, currentUserId, currentRole);
  return {
    hiddenFields: new Set(applicable.flatMap((r) => r.hidden_fields ?? [])),
    hiddenSections: new Set(applicable.flatMap((r) => r.hidden_sections ?? [])),
  };
}

// מאפס בפועל את השדות המוסתרים על אובייקט איש קשר - עוד לפני שהוא נשלח ללקוח
export function redactContactFields(contact: Contact, hiddenFields: Set<string>): Contact {
  if (hiddenFields.size === 0) return contact;
  const redacted: Contact = { ...contact };
  for (const key of hiddenFields) {
    (redacted as unknown as Record<string, unknown>)[key] = null;
  }
  return redacted;
}
