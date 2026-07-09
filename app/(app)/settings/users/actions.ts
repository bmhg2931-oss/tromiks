"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateUserRole(userId: string, formData: FormData) {
  const supabase = await createClient();
  const role = String(formData.get("role") || "");
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
}

export async function approveUser(userId: string, formData: FormData) {
  const supabase = await createClient();
  const role = String(formData.get("role") || "");
  const { error } = await supabase.from("profiles").update({ role, approved: true }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
}

export type DeleteUserResult = { ok: boolean; error?: string };

export async function deleteUserAccount(userId: string): Promise<DeleteUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const { data: myProfile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!myProfile?.is_super_admin) return { ok: false, error: "פעולה זו זמינה רק למנהל הראשי" };
  if (userId === user.id) return { ok: false, error: "לא ניתן למחוק את המשתמש המחובר כרגע" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/users");
  return { ok: true };
}
