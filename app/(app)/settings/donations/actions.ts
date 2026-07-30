"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ListResult = { ok: boolean; error?: string };

async function nextSortOrder(supabase: Awaited<ReturnType<typeof createClient>>, table: "donation_categories" | "donation_handlers") {
  const { data } = await supabase.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? 0) + 1;
}

export async function addDonationCategory(formData: FormData): Promise<ListResult> {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, error: "יש להזין שם קטגוריה" };
  const sort_order = await nextSortOrder(supabase, "donation_categories");
  const { error } = await supabase.from("donation_categories").insert({ name, sort_order });
  if (error) return { ok: false, error: error.code === "23505" ? "קטגוריה בשם הזה כבר קיימת" : error.message };
  revalidatePath("/settings/donations/categories");
  return { ok: true };
}

export async function deleteDonationCategory(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase
    .from("donation_categories")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  revalidatePath("/settings/donations/categories");
  revalidatePath("/settings/trash");
}

export async function setDonationCategoryActive(id: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("donation_categories").update({ active }).eq("id", id);
  revalidatePath("/settings/donations/categories");
}

export async function reorderDonationCategories(orderedIds: string[]) {
  const supabase = await createClient();
  await Promise.all(orderedIds.map((id, index) => supabase.from("donation_categories").update({ sort_order: index + 1 }).eq("id", id)));
  revalidatePath("/settings/donations/categories");
}

type BulkImportResult = { ok: boolean; inserted?: number; error?: string };

export async function bulkImportCategories(names: string[]): Promise<BulkImportResult> {
  const supabase = await createClient();
  const cleaned = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (cleaned.length === 0) return { ok: false, error: "לא נמצאו שורות תקינות לייבוא" };
  const startOrder = await nextSortOrder(supabase, "donation_categories");
  const rows = cleaned.map((name, i) => ({ name, sort_order: startOrder + i }));
  const { error } = await supabase.from("donation_categories").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/donations/categories");
  return { ok: true, inserted: cleaned.length };
}

export async function bulkImportHandlers(names: string[]): Promise<BulkImportResult> {
  const supabase = await createClient();
  const cleaned = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (cleaned.length === 0) return { ok: false, error: "לא נמצאו שורות תקינות לייבוא" };
  const startOrder = await nextSortOrder(supabase, "donation_handlers");
  const rows = cleaned.map((name, i) => ({ name, sort_order: startOrder + i }));
  const { error } = await supabase.from("donation_handlers").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/donations/handlers");
  return { ok: true, inserted: cleaned.length };
}

export async function bulkImportCategoriesFromRows(rows: string[][]): Promise<BulkImportResult> {
  return bulkImportCategories(rows.map((r) => r[0] ?? ""));
}

export async function bulkImportHandlersFromRows(rows: string[][]): Promise<BulkImportResult> {
  return bulkImportHandlers(rows.map((r) => r[0] ?? ""));
}

export async function addDonationHandler(formData: FormData): Promise<ListResult> {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, error: "יש להזין שם מטפל" };
  const sort_order = await nextSortOrder(supabase, "donation_handlers");
  const { error } = await supabase.from("donation_handlers").insert({ name, sort_order });
  if (error) return { ok: false, error: error.code === "23505" ? "מטפל בשם הזה כבר קיים" : error.message };
  revalidatePath("/settings/donations/handlers");
  return { ok: true };
}

export async function deleteDonationHandler(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase
    .from("donation_handlers")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  revalidatePath("/settings/donations/handlers");
  revalidatePath("/settings/trash");
}

export async function setDonationHandlerActive(id: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("donation_handlers").update({ active }).eq("id", id);
  revalidatePath("/settings/donations/handlers");
}

export async function reorderDonationHandlers(orderedIds: string[]) {
  const supabase = await createClient();
  await Promise.all(orderedIds.map((id, index) => supabase.from("donation_handlers").update({ sort_order: index + 1 }).eq("id", id)));
  revalidatePath("/settings/donations/handlers");
}

export async function updateDonationVisibleFields(formData: FormData) {
  const supabase = await createClient();
  const visibleFields = formData.getAll("visible_fields").map((v) => String(v));

  const { error } = await supabase
    .from("donation_field_settings")
    .update({ visible_fields: visibleFields })
    .eq("id", true);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/donations/display");
  revalidatePath("/donations");
}
