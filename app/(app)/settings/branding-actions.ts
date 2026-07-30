"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRichHtml } from "@/lib/sanitizeHtml";
import type { OrgSettings } from "@/lib/types";

const LOGO_BUCKET = "org-branding";

const DEFAULT_ORG_SETTINGS: OrgSettings = {
  org_name: "תרומיקס",
  logo_url: null,
  report_header_note: null,
  report_signature: null,
  invoice_body_text: null,
  payment_links: null,
  email_default_subject: null,
  email_default_body: null,
};

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select(
      "org_name, logo_url, report_header_note, report_signature, invoice_body_text, payment_links, email_default_subject, email_default_body"
    )
    .eq("id", true)
    .single();
  return data ?? DEFAULT_ORG_SETTINGS;
}

function cleanRichField(raw: FormDataEntryValue | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  return sanitizeRichHtml(value);
}

export async function updateOrgSettings(formData: FormData) {
  const supabase = await createClient();

  // שמות שדות מבוססי אינדקס (payment_link_hub_0/payment_link_url_0 וכו') ולא שם
  // המוקד עצמו - כי מוקדים כמו 'ארה"ב' מכילים גרש כפול שעלול לשבש את ה-name attribute
  const paymentLinks: Record<string, string> = {};
  for (let i = 0; formData.has(`payment_link_hub_${i}`); i++) {
    const hub = String(formData.get(`payment_link_hub_${i}`) || "").trim();
    const url = String(formData.get(`payment_link_url_${i}`) || "").trim();
    if (hub && url) paymentLinks[hub] = url;
  }

  const { error } = await supabase
    .from("org_settings")
    .update({
      org_name: String(formData.get("org_name") || "").trim() || "תרומיקס",
      report_header_note: cleanRichField(formData.get("report_header_note")),
      report_signature: cleanRichField(formData.get("report_signature")),
      invoice_body_text: cleanRichField(formData.get("invoice_body_text")),
      payment_links: Object.keys(paymentLinks).length > 0 ? paymentLinks : null,
      email_default_subject: String(formData.get("email_default_subject") || "").trim() || null,
      email_default_body: String(formData.get("email_default_body") || "").trim() || null,
    })
    .eq("id", true);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/branding");
}

export type UploadLogoResult = { ok: boolean; error?: string };

export async function uploadOrgLogo(formData: FormData): Promise<UploadLogoResult> {
  const supabase = await createClient();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "לא נבחר קובץ" };

  const dot = file.name.lastIndexOf(".");
  const ext = dot > -1 ? file.name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) : "png";
  const path = `logo-${Date.now()}.${ext || "png"}`;

  const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: true,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const { error: updateError } = await supabase.from("org_settings").update({ logo_url: pub.publicUrl }).eq("id", true);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/settings/branding");
  return { ok: true };
}
