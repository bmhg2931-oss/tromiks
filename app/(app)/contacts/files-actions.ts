"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "contact-files";

// מפתחות ב-Supabase Storage חייבים להיות ASCII בלבד - שם קובץ בעברית (או כל תו לא-ASCII
// אחר) גורם ל"Invalid key". שם הקובץ המקורי (בעברית) עדיין נשמר במלואו בעמודת file_name
// לצורך תצוגה/הורדה - כאן בונים רק מזהה בטוח לנתיב האחסון עצמו, עם הסיומת המקורית
function safeStorageName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > -1 ? fileName.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) : "";
  return ext ? `${crypto.randomUUID()}.${ext}` : crypto.randomUUID();
}

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

export async function uploadContactFile(
  contactId: string,
  formData: FormData
): Promise<ActionResult & { file?: ContactFileRow }> {
  const supabase = await createClient();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "לא נבחר קובץ" };

  // שם קובץ לא-ASCII (עברית) עובר בפרוטוקול multipart/form-data בתוך פרמטר filename
  // בכותרת Content-Disposition, ופרסר ה-multipart של Node/undici לא תמיד מפענח אותו
  // כ-UTF-8 כראוי - התוצאה היא שם קובץ "מקורקע" (מוג'יבייק). לכן שם הקובץ האמיתי מועבר
  // גם כשדה טקסט נפרד (original_name) שאינו רגיש לבעיה הזו, ומשמש כמקור אמת במקום file.name
  const originalName = String(formData.get("original_name") || file.name || "");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = `${contactId}/${safeStorageName(originalName)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: inserted, error: insertError } = await supabase
    .from("contact_files")
    .insert({
      contact_id: contactId,
      file_name: originalName,
      storage_path: path,
      size_bytes: file.size,
      content_type: file.type || null,
      uploaded_by: user?.id ?? null,
    })
    .select("id, file_name, storage_path, size_bytes, content_type, uploaded_at, uploaded_by")
    .single();
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/contacts");
  return { ok: true, file: inserted as ContactFileRow };
}

export async function getContactFileUrl(storagePath: string, download: boolean | string = false): Promise<UrlResult> {
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
