"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContactFormResult = { ok: boolean; error?: string };

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function str(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim() || null;
}

function buildContactPayload(formData: FormData) {
  return {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim(),
    spouse_name: str(formData, "spouse_name"),
    id_number: str(formData, "id_number"),
    phone: String(formData.get("phone") || "").trim(),
    email: str(formData, "email"),
    address: str(formData, "address"),
    department: str(formData, "department"),
    status: String(formData.get("status") || "פעיל"),
    joined_date: str(formData, "joined_date"),
    tags: parseTags(formData.get("tags")),
    notes: str(formData, "notes"),
    title: str(formData, "title"),
    street: str(formData, "street"),
    house_number: str(formData, "house_number"),
    city: str(formData, "city"),
    country: str(formData, "country"),
    postal_code: str(formData, "postal_code"),
    mobile_secondary: str(formData, "mobile_secondary"),
    home_phone: str(formData, "home_phone"),
    wife_mobile: str(formData, "wife_mobile"),
    email_secondary: str(formData, "email_secondary"),
    full_name_with_mother: str(formData, "full_name_with_mother"),
    full_name_with_father: str(formData, "full_name_with_father"),
    mailing_name: str(formData, "mailing_name"),
  };
}

export async function createContact(
  _prevState: ContactFormResult | null,
  formData: FormData
): Promise<ContactFormResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").insert(buildContactPayload(formData));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function updateContact(
  id: string,
  _prevState: ContactFormResult | null,
  formData: FormData
): Promise<ContactFormResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").update(buildContactPayload(formData)).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function softDeleteContact(id: string): Promise<ContactFormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  revalidatePath("/settings/trash");
  return { ok: true };
}

export async function restoreContact(id: string): Promise<ContactFormResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").update({ deleted_at: null, deleted_by: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  revalidatePath("/settings/contacts/deleted");
  revalidatePath("/settings/trash");
  return { ok: true };
}
