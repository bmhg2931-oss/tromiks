import { createClient } from "@/lib/supabase/server";

export async function logContactActivity(contactId: string, action: string, details?: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("contact_activity_log").insert({ contact_id: contactId, actor_id: user?.id ?? null, action, details: details ?? null });
}
