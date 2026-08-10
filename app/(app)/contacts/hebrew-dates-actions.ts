"use server";

import { createClient } from "@/lib/supabase/server";
import { logContactActivity } from "@/lib/activityLog";
import { HEBREW_MONTH_NAMES } from "@/lib/hebrewDate";
import type { ContactHebrewDate, HebrewDateType } from "@/lib/types";

type Result = { ok: boolean; error?: string };

export async function listContactHebrewDates(contactId: string): Promise<{ ok: boolean; dates?: ContactHebrewDate[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_hebrew_dates")
    .select("*")
    .eq("contact_id", contactId)
    .order("hebrew_month")
    .order("hebrew_day");
  if (error) return { ok: false, error: error.message };
  return { ok: true, dates: (data ?? []) as ContactHebrewDate[] };
}

export async function createContactHebrewDate(
  contactId: string,
  input: { hebrewDay: number; hebrewMonth: string; hebrewYear: number | null; dateType: HebrewDateType; details: string | null }
): Promise<Result> {
  if (!HEBREW_MONTH_NAMES[input.hebrewMonth]) return { ok: false, error: "חודש עברי לא תקין" };
  if (!Number.isInteger(input.hebrewDay) || input.hebrewDay < 1 || input.hebrewDay > 30) return { ok: false, error: "יום עברי לא תקין" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("contact_hebrew_dates").insert({
    contact_id: contactId,
    hebrew_day: input.hebrewDay,
    hebrew_month: input.hebrewMonth,
    hebrew_year: input.hebrewYear,
    date_type: input.dateType,
    details: input.details,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  await logContactActivity(contactId, `נוסף תאריך עברי (${input.dateType}): ${input.hebrewDay} ${HEBREW_MONTH_NAMES[input.hebrewMonth]}`);
  return { ok: true };
}

export async function deleteContactHebrewDate(id: string, contactId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_hebrew_dates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logContactActivity(contactId, "נמחק תאריך עברי מהתאריכון");
  return { ok: true };
}
