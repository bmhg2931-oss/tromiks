"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "contact-files";

export type ContactFileRow = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  content_type: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

type ListResult = { ok: boolean; files?: ContactFileRow[]; error?: string };
type ActionResult = { ok: boolean; error?: string };
type UrlResult = { ok: boolean; url?: string; error?: string };

export async function listContactFiles(contactId: string): Promise<ListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_files")
    .select("id, file_name, storage_path, size_bytes, content_type, uploaded_at, uploaded_by")
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, files: data ?? [] };
}

export async function uploadContactFile(contactId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "לא נבחר קובץ" };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = `${contactId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error: insertError } = await supabase.from("contact_files").insert({
    contact_id: contactId,
    file_name: file.name,
    storage_path: path,
    size_bytes: file.size,
    content_type: file.type || null,
    uploaded_by: user?.id ?? null,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/contacts");
  return { ok: true };
}

export async function getContactFileUrl(storagePath: string, download = false): Promise<UrlResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60, { download });
  if (error || !data) return { ok: false, error: error?.message || "שגיאה ביצירת קישור לקובץ" };
  return { ok: true, url: data.signedUrl };
}

export async function deleteContactFile(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("contact_files")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  revalidatePath("/settings/trash");
  return { ok: true };
}
