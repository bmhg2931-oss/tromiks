"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getCurrentExchangeRate } from "@/lib/exchangeRate";

type CityResult = { ok: boolean; error?: string };

async function nextSortOrder(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("contact_cities").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? 0) + 1;
}

export async function addContactCity(formData: FormData): Promise<CityResult> {
  const supabase = await createClient();
  const city = String(formData.get("city") || "").trim();
  const country = String(formData.get("country") || "").trim();
  if (!city || !country) return { ok: false, error: "יש להזין עיר וארץ" };
  const sort_order = await nextSortOrder(supabase);
  const { error } = await supabase.from("contact_cities").insert({ city, country, sort_order });
  if (error) return { ok: false, error: error.code === "23505" ? "עיר בשם הזה כבר קיימת" : error.message };
  revalidatePath("/settings/contacts/cities");
  return { ok: true };
}

export async function updateContactCity(id: string, city: string, country: string): Promise<CityResult> {
  const supabase = await createClient();
  if (!city.trim() || !country.trim()) return { ok: false, error: "יש להזין עיר וארץ" };
  const { error } = await supabase.from("contact_cities").update({ city: city.trim(), country: country.trim() }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "עיר בשם הזה כבר קיימת" : error.message };
  revalidatePath("/settings/contacts/cities");
  revalidatePath("/contacts");
  return { ok: true };
}

type BulkImportResult = { ok: boolean; inserted?: number; error?: string };

export async function bulkImportCities(rows: { city: string; country: string }[]): Promise<BulkImportResult> {
  const supabase = await createClient();
  const seen = new Set<string>();
  const cleaned = rows
    .map((r) => ({ city: r.city.trim(), country: r.country.trim() }))
    .filter((r) => r.city && r.country)
    .filter((r) => {
      if (seen.has(r.city)) return false;
      seen.add(r.city);
      return true;
    });
  if (cleaned.length === 0) return { ok: false, error: "לא נמצאו שורות תקינות לייבוא (יש צורך בעיר וארץ בכל שורה)" };
  const startOrder = await nextSortOrder(supabase);
  const insertRows = cleaned.map((r, i) => ({ ...r, sort_order: startOrder + i }));
  const { error } = await supabase.from("contact_cities").upsert(insertRows, { onConflict: "city", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/contacts/cities");
  return { ok: true, inserted: cleaned.length };
}

export async function bulkImportCitiesFromRows(rows: string[][]): Promise<BulkImportResult> {
  return bulkImportCities(rows.map((r) => ({ city: r[0] ?? "", country: r[1] ?? "" })));
}

type ExportResult = { ok: boolean; rows?: Record<string, unknown>[]; error?: string };

export async function exportCitiesRows(): Promise<ExportResult> {
  const supabase = await createClient();
  const [{ data: cities, error: citiesErr }, contactsResult, donationsResult] = await Promise.all([
    supabase.from("contact_cities").select("city, country").is("deleted_at", null).order("sort_order"),
    fetchAllRows<{ id: string; city: string | null }>(() => supabase.from("contacts").select("id, city").is("deleted_at", null)),
    fetchAllRows<{ contact_id: string; amount: number; currency: string }>(() =>
      supabase.from("donations").select("contact_id, amount, currency").is("deleted_at", null)
    ),
  ]);
  if (citiesErr) return { ok: false, error: citiesErr.message };
  const { data: contactRows, error: contactsErr } = contactsResult;
  const { data: donationRows, error: donationsErr } = donationsResult;
  if (contactsErr || donationsErr) return { ok: false, error: contactsErr?.message || donationsErr?.message };

  const cityByContactId = new Map(contactRows.filter((c) => c.city).map((c) => [c.id, c.city as string]));
  const contactCountByCity = new Map<string, number>();
  for (const c of contactRows) {
    if (!c.city) continue;
    contactCountByCity.set(c.city, (contactCountByCity.get(c.city) ?? 0) + 1);
  }

  const donorSetByCity = new Map<string, Set<string>>();
  const currencyTotalsByCity = new Map<string, Map<string, number>>();
  for (const d of donationRows) {
    const city = cityByContactId.get(d.contact_id);
    if (!city) continue;
    if (!donorSetByCity.has(city)) donorSetByCity.set(city, new Set());
    donorSetByCity.get(city)!.add(d.contact_id);
    if (!currencyTotalsByCity.has(city)) currencyTotalsByCity.set(city, new Map());
    const m = currencyTotalsByCity.get(city)!;
    const cur = d.currency || "₪";
    m.set(cur, (m.get(cur) ?? 0) + Number(d.amount));
  }

  // שערי המרה נשלפים פעם אחת לכל מטבע (לא לכל עיר בנפרד) כדי לאפשר סה"כ מאוחד בש"ח
  const allCurrencies = new Set<string>();
  for (const m of currencyTotalsByCity.values()) for (const cur of m.keys()) allCurrencies.add(cur);
  const rates = new Map<string, number>([["₪", 1]]);
  await Promise.all(
    Array.from(allCurrencies)
      .filter((cur) => cur !== "₪")
      .map(async (cur) => {
        const res = await getCurrentExchangeRate(cur);
        rates.set(cur, res.ok && res.rate ? res.rate : 0);
      })
  );

  const rows = (cities ?? []).map((c) => {
    const totals = currencyTotalsByCity.get(c.city);
    const totalILS = totals
      ? Array.from(totals.entries()).reduce((sum, [cur, amt]) => sum + amt * (rates.get(cur) ?? 0), 0)
      : 0;
    return {
      "עיר": c.city,
      "ארץ": c.country,
      "מספר אנשי קשר": contactCountByCity.get(c.city) ?? 0,
      "מספר תורמים": donorSetByCity.get(c.city)?.size ?? 0,
      'סה"כ תרומות (₪)': Math.round(totalILS),
    };
  });
  return { ok: true, rows };
}

export async function deleteContactCity(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase
    .from("contact_cities")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  revalidatePath("/settings/contacts/cities");
  revalidatePath("/settings/trash");
}
