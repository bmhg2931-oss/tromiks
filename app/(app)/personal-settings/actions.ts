"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateOwnDefaults(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");

  const defaultPaymentHub = String(formData.get("default_payment_hub") || "ישראל");
  const defaultCurrency = String(formData.get("default_currency") || "₪");
  const { error } = await supabase
    .from("profiles")
    .update({ default_payment_hub: defaultPaymentHub, default_currency: defaultCurrency })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
