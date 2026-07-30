"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type VisibilityRule = {
  id: string;
  tag: string;
  scope_type: "role" | "user";
  role: string | null;
  user_id: string | null;
  user_name?: string | null;
  hide_contact: boolean;
  hidden_fields: string[] | null;
  hidden_sections: string[] | null;
};

type ListResult = { ok: boolean; rules?: VisibilityRule[]; error?: string };
type ActionResult = { ok: boolean; error?: string };

export async function listVisibilityRules(): Promise<ListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_visibility_rules")
    .select("id, tag, scope_type, role, user_id, hide_contact, hidden_fields, hidden_sections")
    .order("tag");
  if (error) return { ok: false, error: error.message };

  const userIds = Array.from(new Set((data ?? []).filter((r) => r.user_id).map((r) => r.user_id as string)));
  let namesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    namesById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "משתמש"]));
  }

  const rules: VisibilityRule[] = (data ?? []).map((r) => ({
    ...r,
    scope_type: r.scope_type as "role" | "user",
    user_name: r.user_id ? namesById.get(r.user_id) ?? "משתמש" : null,
  }));
  return { ok: true, rules };
}

export async function addVisibilityRule(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const tag = String(formData.get("tag") || "").trim();
  const scopeType = String(formData.get("scope_type") || "role") as "role" | "user";
  const role = scopeType === "role" ? String(formData.get("role") || "") || null : null;
  const userId = scopeType === "user" ? String(formData.get("user_id") || "") || null : null;
  const hideContact = formData.get("hide_contact") === "on";
  const hiddenFields = formData.getAll("hidden_fields").map(String);
  const hiddenSections = formData.getAll("hidden_sections").map(String);

  if (!tag) return { ok: false, error: "יש לבחור תגית" };
  if (scopeType === "role" && !role) return { ok: false, error: "יש לבחור תפקיד" };
  if (scopeType === "user" && !userId) return { ok: false, error: "יש לבחור משתמש" };
  if (!hideContact && hiddenFields.length === 0 && hiddenSections.length === 0) {
    return { ok: false, error: "יש לבחור לפחות אפשרות הסתרה אחת" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("contact_visibility_rules").insert({
    tag,
    scope_type: scopeType,
    role,
    user_id: userId,
    hide_contact: hideContact,
    hidden_fields: hiddenFields.length > 0 ? hiddenFields : null,
    hidden_sections: hiddenSections.length > 0 ? hiddenSections : null,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/contacts/visibility");
  revalidatePath("/contacts");
  return { ok: true };
}

export async function deleteVisibilityRule(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_visibility_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/contacts/visibility");
  revalidatePath("/contacts");
  return { ok: true };
}
