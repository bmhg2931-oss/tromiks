"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import type { Contact } from "@/lib/types";

type ExportResult = { ok: boolean; rows?: Record<string, unknown>[]; error?: string };

export async function exportContactsRows(): Promise<ExportResult> {
  const supabase = await createClient();
  const { data, error } = await fetchAllRows<Contact>(() =>
    supabase.from("contacts").select("*").is("deleted_at", null).order("last_name").order("first_name")
  );
  if (error) return { ok: false, error: error.message };

  const rows = data.map((c) => ({
    "שם פרטי": c.first_name,
    "שם משפחה": c.last_name,
    "שם בת הזוג": c.spouse_name ?? "",
    "טלפון": c.phone,
    "סלולארי נוסף": c.mobile_secondary ?? "",
    "טלפון בית": c.home_phone ?? "",
    "פלאפון נשים": c.wife_mobile ?? "",
    "אימייל": c.email ?? "",
    "אימייל נוסף": c.email_secondary ?? "",
    "רחוב": c.street ?? "",
    "מספר בית": c.house_number ?? "",
    "עיר": c.city ?? "",
    "ארץ": c.country ?? "",
    "מיקוד": c.postal_code ?? "",
    'ת.ז / מספר עוסק': c.id_number ?? "",
    "מחלקה": c.department ?? "",
    "סטטוס": c.status,
    "תאריך הצטרפות": c.joined_date ?? "",
    "תגיות": (c.tags ?? []).join(", "),
    "הערות": c.notes ?? "",
  }));
  return { ok: true, rows };
}
