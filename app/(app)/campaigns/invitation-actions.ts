"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type InvitationActionResult = { ok: boolean; error?: string };

export async function setInvitationStatus(campaignId: string, contactId: string, status: string): Promise<InvitationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const patch: Record<string, unknown> = { campaign_id: campaignId, contact_id: contactId, status };
  if (status === "הוזמן") {
    patch.invited_at = new Date().toISOString();
    patch.invited_by = user?.id ?? null;
  }

  const { error } = await supabase
    .from("campaign_contact_invitations")
    .upsert(patch, { onConflict: "campaign_id,contact_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function markInvited(campaignId: string, contactId: string): Promise<InvitationActionResult> {
  return setInvitationStatus(campaignId, contactId, "הוזמן");
}
