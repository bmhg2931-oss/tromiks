"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CampaignSettingsResult = { ok: boolean; error?: string };

export async function updateCampaignDepartments(campaignId: string, departments: string[]): Promise<CampaignSettingsResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ audience_mode: "department", included_departments: departments.length > 0 ? departments : null })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function updateCampaignContactIds(campaignId: string, contactIds: string[]): Promise<CampaignSettingsResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ audience_mode: "manual", included_contact_ids: contactIds.length > 0 ? contactIds : null })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function updateCampaignTemplates(campaignId: string, emailTemplate: string, faxTemplate: string): Promise<CampaignSettingsResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ email_template: emailTemplate.trim() || null, fax_template: faxTemplate.trim() || null })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

// מייבא ממדי דירוג + דרגותיהם, וכל המיפויים/דירוגים הקיימים של אנשי הקשר, מקמפיין
// מקור לקמפיין היעד (הנוכחי) - שימושי כדי לא להגדיר מחדש את אותם ממדים/דרגות בכל
// קמפיין חדש. אינו מוחק נתונים קיימים בקמפיין היעד - רק מוסיף/מעדכן (upsert לפי
// contact_id בעת מיפוי, insert חדש לגמרי עבור ממדים/דרגות)
export async function importCampaignMapping(targetCampaignId: string, sourceCampaignId: string): Promise<CampaignSettingsResult> {
  if (targetCampaignId === sourceCampaignId) return { ok: false, error: "יש לבחור קמפיין מקור שונה מהקמפיין הנוכחי" };
  const supabase = await createClient();

  const [{ data: sourceDimensions }, { data: sourceMappings }] = await Promise.all([
    supabase.from("campaign_mapping_dimensions").select("id, name, sort_order").eq("campaign_id", sourceCampaignId).order("sort_order"),
    supabase
      .from("campaign_contact_mappings")
      .select("id, contact_id, target_amount, potential_amount, status, notes")
      .eq("campaign_id", sourceCampaignId),
  ]);

  // ממדים + דרגות: יוצר עותקים חדשים תחת הקמפיין הנוכחי, ובונה מיפוי id ישן -> חדש
  const dimensionIdMap = new Map<string, string>();
  const levelIdMap = new Map<string, string>();

  for (const dim of sourceDimensions ?? []) {
    const { data: newDim, error } = await supabase
      .from("campaign_mapping_dimensions")
      .insert({ campaign_id: targetCampaignId, name: dim.name, sort_order: dim.sort_order })
      .select("id")
      .single();
    if (error || !newDim) return { ok: false, error: error?.message ?? "שגיאה בייבוא ממדים" };
    dimensionIdMap.set(dim.id, newDim.id);

    const { data: sourceLevels } = await supabase
      .from("campaign_mapping_dimension_levels")
      .select("id, label, sort_order")
      .eq("dimension_id", dim.id)
      .order("sort_order");
    for (const level of sourceLevels ?? []) {
      const { data: newLevel, error: levelError } = await supabase
        .from("campaign_mapping_dimension_levels")
        .insert({ dimension_id: newDim.id, label: level.label, sort_order: level.sort_order })
        .select("id")
        .single();
      if (levelError || !newLevel) return { ok: false, error: levelError?.message ?? "שגיאה בייבוא דרגות" };
      levelIdMap.set(level.id, newLevel.id);
    }
  }

  // מיפויי אנשי קשר: upsert לפי contact_id בקמפיין היעד, ובונה מיפוי מזהה מיפוי-מקור -> יעד
  const mappingIdMap = new Map<string, string>();
  for (const m of sourceMappings ?? []) {
    const { data: targetMapping, error } = await supabase
      .from("campaign_contact_mappings")
      .upsert(
        {
          campaign_id: targetCampaignId,
          contact_id: m.contact_id,
          target_amount: m.target_amount,
          potential_amount: m.potential_amount,
          status: m.status,
          notes: m.notes,
        },
        { onConflict: "campaign_id,contact_id" }
      )
      .select("id")
      .single();
    if (error || !targetMapping) return { ok: false, error: error?.message ?? "שגיאה בייבוא מיפויים" };
    mappingIdMap.set(m.id, targetMapping.id);
  }

  // דירוגי ממדים לכל מיפוי מקור, מתורגמים למזהי המיפוי/ממד/דרגה החדשים בקמפיין היעד
  if (mappingIdMap.size > 0) {
    const { data: sourceScores } = await supabase
      .from("campaign_contact_dimension_scores")
      .select("mapping_id, dimension_id, level_id")
      .in("mapping_id", Array.from(mappingIdMap.keys()));

    for (const s of sourceScores ?? []) {
      const newMappingId = mappingIdMap.get(s.mapping_id);
      const newDimensionId = dimensionIdMap.get(s.dimension_id);
      const newLevelId = levelIdMap.get(s.level_id);
      if (!newMappingId || !newDimensionId || !newLevelId) continue;
      await supabase
        .from("campaign_contact_dimension_scores")
        .upsert(
          { mapping_id: newMappingId, dimension_id: newDimensionId, level_id: newLevelId },
          { onConflict: "mapping_id,dimension_id" }
        );
    }
  }

  revalidatePath(`/campaigns/${targetCampaignId}`);
  return { ok: true };
}
