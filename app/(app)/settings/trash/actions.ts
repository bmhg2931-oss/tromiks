"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TrashTable =
  | "contacts"
  | "donations"
  | "pledges"
  | "donation_categories"
  | "donation_handlers"
  | "contact_cities"
  | "contact_files";

export type TrashActionResult = { ok: boolean; error?: string };

export async function softDeleteRecord(table: TrashTable, id: string): Promise<TrashActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/trash");
  revalidatePath("/contacts");
  revalidatePath("/donations");
  return { ok: true };
}

export async function restoreRecord(table: TrashTable, id: string): Promise<TrashActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ deleted_at: null, deleted_by: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/trash");
  revalidatePath("/contacts");
  revalidatePath("/donations");
  revalidatePath("/settings/donations/categories");
  revalidatePath("/settings/donations/handlers");
  revalidatePath("/settings/contacts/cities");
  return { ok: true };
}
