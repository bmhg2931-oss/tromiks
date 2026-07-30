"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateVisibleFields(formData: FormData) {
  const supabase = await createClient();
  const visibleFields = formData.getAll("visible_fields").map((v) => String(v));
  const showInactive = formData.get("show_inactive") === "on";

  const { error } = await supabase
    .from("contact_field_settings")
    .update({ visible_fields: visibleFields, show_inactive: showInactive })
    .eq("id", true);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/contacts");
  revalidatePath("/contacts");
}
