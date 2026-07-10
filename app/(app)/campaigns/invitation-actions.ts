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

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "וואטסאפ",
  email: 'דוא"ל',
};

// מסמן שההזמנה נשלחה, וגם מתעד זאת כשורת "שיחה" בהיסטוריית הלקוח (כדי שהשליחה
// תופיע יחד עם שאר ההיסטוריה של איש הקשר בטאב ההתרמה/מיפוי) - עבור כל ערוצי השליחה
export async function recordInvitationSent(campaignId: string, contactId: string, channel: "whatsapp" | "email"): Promise<InvitationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ error: invError }, { error: logError }] = await Promise.all([
    supabase.from("campaign_contact_invitations").upsert(
      { campaign_id: campaignId, contact_id: contactId, status: "הוזמן", invited_at: new Date().toISOString(), invited_by: user?.id ?? null },
      { onConflict: "campaign_id,contact_id" }
    ),
    supabase.from("campaign_call_logs").insert({
      campaign_id: campaignId,
      contact_id: contactId,
      called_by: user?.id ?? null,
      outcome: `נשלחה הזמנה ב${CHANNEL_LABELS[channel] ?? channel}`,
    }),
  ]);
  if (invError) return { ok: false, error: invError.message };
  if (logError) return { ok: false, error: logError.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}
