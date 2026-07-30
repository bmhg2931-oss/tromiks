"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logContactActivity } from "@/lib/activityLog";
import { CONTACT_FIELD_DEFS } from "@/lib/types";

export type ContactFormResult = { ok: boolean; error?: string; errorCode?: string };

const FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries(CONTACT_FIELD_DEFS.map((f) => [f.key, f.label])),
  street: "רחוב",
  house_number: "מספר בית",
  city: "עיר",
};

function fieldDisplay(v: unknown): string {
  if (v == null || v === "") return "ריק";
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "ריק";
  return String(v);
}

// משווה בין הרשומה הישנה לחדשה ובונה תיאור "שדה: ערך ישן ← ערך חדש" לכל שדה
// ששונה בפועל - כדי שעמודת "פרטים" ביומן הפעילות תראה מה בדיוק עודכן
function diffContactFields(before: Record<string, unknown>, after: Record<string, unknown>): string | null {
  const changes: string[] = [];
  for (const key of Object.keys(after)) {
    const oldVal = before[key];
    const newVal = after[key];
    const oldStr = Array.isArray(oldVal) ? oldVal.join(",") : String(oldVal ?? "");
    const newStr = Array.isArray(newVal) ? newVal.join(",") : String(newVal ?? "");
    if (oldStr === newStr) continue;
    const label = FIELD_LABELS[key] ?? key;
    changes.push(`${label}: ${fieldDisplay(oldVal)} ← ${fieldDisplay(newVal)}`);
  }
  return changes.length > 0 ? changes.join(" · ") : null;
}

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
    wife_id_number: str(formData, "wife_id_number"),
    father_name: str(formData, "father_name"),
    father_in_law_name: str(formData, "father_in_law_name"),
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
  if (error) return { ok: false, error: error.message, errorCode: error.code };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function updateContact(
  id: string,
  _prevState: ContactFormResult | null,
  formData: FormData
): Promise<ContactFormResult> {
  const supabase = await createClient();
  const payload = buildContactPayload(formData);
  const { data: before } = await supabase.from("contacts").select(Object.keys(payload).join(",")).eq("id", id).single();
  const { error } = await supabase.from("contacts").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message, errorCode: error.code };
  const details = before ? diffContactFields(before as unknown as Record<string, unknown>, payload) : null;
  await logContactActivity(id, "עדכון פרטי איש קשר", details);
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
