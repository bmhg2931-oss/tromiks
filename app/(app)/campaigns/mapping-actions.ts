"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type MappingActionResult = { ok: boolean; error?: string };

// יוצר שורת מיפוי ריקה עבור צמד קמפיין+איש קשר אם עדיין לא קיימת (ללא דריסת שדות
// קיימים - ה-upsert מציין רק campaign_id/contact_id כך שערכים אחרים לא נוגעים בהם),
// ומחזיר את מזהה השורה - נדרש לפני קביעת דירוג ממד, שיכול להיות הפעולה הראשונה
// שמתבצעת על איש קשר מסוים בקמפיין (לפני שמולאו יעד/פוטנציאל)
async function ensureMapping(supabase: Supabase, campaignId: string, contactId: string): Promise<string> {
  const { data, error } = await supabase
    .from("campaign_contact_mappings")
    .upsert({ campaign_id: campaignId, contact_id: contactId }, { onConflict: "campaign_id,contact_id" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "שגיאה ביצירת מיפוי");
  return data.id;
}

// מעדכן רק יעד/פוטנציאל/סטטוס (שדות הטבלה הראשית) - ההערות מנוהלות בנפרד דרך
// updateMappingNotes כדי שעדכון אחד לא ידרוס בטעות שינוי שבוצע במקביל בשני
export async function upsertMapping(campaignId: string, contactId: string, formData: FormData): Promise<MappingActionResult> {
  const supabase = await createClient();
  const target_amount = formData.get("target_amount") ? Number(formData.get("target_amount")) : null;
  const potential_amount = formData.get("potential_amount") ? Number(formData.get("potential_amount")) : null;
  const status = String(formData.get("status") || "טרם טופל");

  const { error } = await supabase
    .from("campaign_contact_mappings")
    .upsert(
      { campaign_id: campaignId, contact_id: contactId, target_amount, potential_amount, status },
      { onConflict: "campaign_id,contact_id" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function updateMappingNotes(campaignId: string, contactId: string, notes: string): Promise<MappingActionResult> {
  const supabase = await createClient();
  try {
    const mappingId = await ensureMapping(supabase, campaignId, contactId);
    const { error } = await supabase
      .from("campaign_contact_mappings")
      .update({ notes: notes.trim() || null })
      .eq("id", mappingId);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בשמירת הערות" };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function createDimension(campaignId: string, name: string): Promise<MappingActionResult> {
  if (!name.trim()) return { ok: false, error: "יש להזין שם לממד" };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("campaign_mapping_dimensions")
    .select("sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("campaign_mapping_dimensions").insert({ campaign_id: campaignId, name: name.trim(), sort_order: nextOrder });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

// הפרמטרים בפונקציות הבאות מסודרים עם campaignId ראשון בכוונה - כדי לאפשר
// .bind(null, campaignId) בקומפוננטת השרת ולהעביר את התוצאה כ-prop לקומפוננטת
// לקוח (CampaignDimensionsManager); רק Server Action מחייב-אמיתי (כולל bind שלו)
// ניתן להעברה כך - פונקציית עטיפה רגילה הייתה נכשלת עם "Event handlers cannot
// be passed to Client Component props"
export async function deleteDimension(campaignId: string, dimensionId: string): Promise<MappingActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_mapping_dimensions").delete().eq("id", dimensionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function addDimensionLevel(campaignId: string, dimensionId: string, label: string): Promise<MappingActionResult> {
  if (!label.trim()) return { ok: false, error: "יש להזין שם לדרגה" };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("campaign_mapping_dimension_levels")
    .select("sort_order")
    .eq("dimension_id", dimensionId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
  const { error } = await supabase
    .from("campaign_mapping_dimension_levels")
    .insert({ dimension_id: dimensionId, label: label.trim(), sort_order: nextOrder });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function deleteDimensionLevel(campaignId: string, levelId: string): Promise<MappingActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_mapping_dimension_levels").delete().eq("id", levelId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function setDimensionScore(
  campaignId: string,
  contactId: string,
  dimensionId: string,
  levelId: string
): Promise<MappingActionResult> {
  const supabase = await createClient();
  try {
    const mappingId = await ensureMapping(supabase, campaignId, contactId);
    const { error } = await supabase
      .from("campaign_contact_dimension_scores")
      .upsert({ mapping_id: mappingId, dimension_id: dimensionId, level_id: levelId }, { onConflict: "mapping_id,dimension_id" });
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בשמירת דירוג" };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}
