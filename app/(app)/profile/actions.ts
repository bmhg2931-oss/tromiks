"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");

  const fullName = String(formData.get("full_name") || "").trim();
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
