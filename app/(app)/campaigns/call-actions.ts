"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CallActionResult = { ok: boolean; error?: string };

export async function addCallLog(campaignId: string, contactId: string, formData: FormData): Promise<CallActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const outcome = String(formData.get("outcome") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { error } = await supabase
    .from("campaign_call_logs")
    .insert({ campaign_id: campaignId, contact_id: contactId, called_by: user?.id ?? null, outcome, notes });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function addReminder(campaignId: string, contactId: string, formData: FormData): Promise<CallActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const due_date = String(formData.get("due_date") || "");
  if (!due_date) return { ok: false, error: "יש לבחור תאריך תזכורת" };
  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await supabase.from("campaign_reminders").insert({
    campaign_id: campaignId,
    contact_id: contactId,
    due_date,
    note,
    assigned_to: user?.id ?? null,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function completeReminder(id: string, campaignId: string): Promise<CallActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_reminders")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function deleteReminder(id: string, campaignId: string): Promise<CallActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_reminders").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export type CampaignCallLogRow = {
  id: string;
  campaign_id: string;
  campaignName: string;
  call_date: string;
  outcome: string | null;
  notes: string | null;
  calledByName: string | null;
};

export type CampaignReminderRow = {
  id: string;
  due_date: string;
  note: string | null;
  completed: boolean;
  completed_at: string | null;
};

// שולף את פעילות השיחות/תזכורות של איש קשר עבור הקמפיין הנוכחי; אם crossCampaign
// מסומן, השיחות (לא התזכורות - אלו נשארות תמיד ממוקדות בקמפיין הנוכחי בלבד) נשלפות
// מכל הקמפיינים שאותו איש קשר היה בהם, כדי לאפשר עיון בהיסטוריה המלאה שלו
export async function getCampaignContactActivity(
  campaignId: string,
  contactId: string,
  crossCampaign: boolean
): Promise<{ calls: CampaignCallLogRow[]; reminders: CampaignReminderRow[] }> {
  const supabase = await createClient();

  let callsQuery = supabase
    .from("campaign_call_logs")
    .select("id, campaign_id, call_date, outcome, notes, called_by, campaigns(name)")
    .eq("contact_id", contactId)
    .order("call_date", { ascending: false });
  if (!crossCampaign) callsQuery = callsQuery.eq("campaign_id", campaignId);

  const [{ data: calls }, { data: reminders }, { data: profiles }] = await Promise.all([
    callsQuery,
    supabase
      .from("campaign_reminders")
      .select("id, due_date, note, completed, completed_at")
      .eq("campaign_id", campaignId)
      .eq("contact_id", contactId)
      .order("due_date", { ascending: true }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "משתמש"]));

  return {
    calls: (calls ?? []).map((c) => {
      const campaign = Array.isArray(c.campaigns) ? c.campaigns[0] : c.campaigns;
      return {
        id: c.id,
        campaign_id: c.campaign_id,
        campaignName: campaign?.name ?? "",
        call_date: c.call_date,
        outcome: c.outcome,
        notes: c.notes,
        calledByName: c.called_by ? nameById.get(c.called_by) ?? "משתמש" : null,
      };
    }),
    reminders: (reminders ?? []) as CampaignReminderRow[],
  };
}
