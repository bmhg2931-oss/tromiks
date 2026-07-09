"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CampaignFormResult = { ok: boolean; error?: string };

function str(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim() || null;
}

function buildCampaignPayload(formData: FormData) {
  return {
    name: String(formData.get("name") || "").trim(),
    description: str(formData, "description"),
    parent_campaign_id: str(formData, "parent_campaign_id"),
    goal_amount: formData.get("goal_amount") ? Number(formData.get("goal_amount")) : null,
    goal_currency: String(formData.get("goal_currency") || "₪"),
    start_date: str(formData, "start_date"),
    end_date: str(formData, "end_date"),
    status: String(formData.get("status") || "פעיל"),
    enabled_tabs: String(formData.get("enabled_tabs") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export async function createCampaign(
  _prevState: CampaignFormResult | null,
  formData: FormData
): Promise<CampaignFormResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload = buildCampaignPayload(formData);
  if (!payload.name) return { ok: false, error: "יש להזין שם קמפיין" };

  const { error } = await supabase.from("campaigns").insert({ ...payload, created_by: user?.id ?? null });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campaigns");
  return { ok: true };
}

export async function updateCampaign(
  id: string,
  _prevState: CampaignFormResult | null,
  formData: FormData
): Promise<CampaignFormResult> {
  const supabase = await createClient();

  const payload = buildCampaignPayload(formData);
  if (!payload.name) return { ok: false, error: "יש להזין שם קמפיין" };

  const { error } = await supabase.from("campaigns").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true };
}
