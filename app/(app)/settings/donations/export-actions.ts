"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";

type ExportResult = { ok: boolean; rows?: Record<string, unknown>[]; error?: string };

export async function exportCategoriesRows(): Promise<ExportResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("donation_categories")
    .select("name, active")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []).map((c) => ({ שם: c.name, פעיל: c.active ? "כן" : "לא" })) };
}

export async function exportHandlersRows(): Promise<ExportResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("donation_handlers")
    .select("name, active")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []).map((h) => ({ שם: h.name, פעיל: h.active ? "כן" : "לא" })) };
}

type ContactMini = { first_name: string; last_name: string; phone: string; city: string | null };

type DonationRow = {
  id: string;
  pledge_id: string | null;
  amount: number;
  currency: string;
  donation_date: string;
  purpose: string | null;
  payment_method: string | null;
  payment_hub: string | null;
  status: string | null;
  notes: string | null;
  contacts: ContactMini | ContactMini[] | null;
};

type PledgeRow = {
  id: string;
  amount: number;
  currency: string;
  pledge_date: string;
  category: string | null;
  payment_hub: string | null;
  status: string | null;
  details: string | null;
  contacts: ContactMini | ContactMini[] | null;
};

function oneContact(c: ContactMini | ContactMini[] | null) {
  return Array.isArray(c) ? c[0] : c;
}

// כל רשומה בדוח מייצגת תנועה: התחייבות (חוב על התורם) ו/או תשלום (זכות/כיסוי בפועל) - עם
// סכום ומטבע נפרדים לכל צד, כי תשלום עשוי להיות במטבע שונה מההתחייבות שכיסה (למשל התחייבות
// ב-$ ותשלום בפועל ב-₪). רשומה "מאוחדת" (התחייבות ותשלום יחד) ממלאת את שני הצדדים באותה שורה.
export async function exportDonationsRows(): Promise<ExportResult> {
  const supabase = await createClient();
  const [{ data: donations, error: dErr }, { data: pledges, error: pErr }] = await Promise.all([
    fetchAllRows<DonationRow>(() =>
      supabase
        .from("donations")
        .select(
          "id, pledge_id, amount, currency, donation_date, purpose, payment_method, payment_hub, status, notes, contacts(first_name, last_name, phone, city)"
        )
        .is("deleted_at", null)
        .order("donation_date", { ascending: false })
    ),
    fetchAllRows<PledgeRow>(() =>
      supabase
        .from("pledges")
        .select("id, amount, currency, pledge_date, category, payment_hub, status, details, contacts(first_name, last_name, phone, city)")
        .is("deleted_at", null)
        .order("pledge_date", { ascending: false })
    ),
  ]);
  if (dErr || pErr) return { ok: false, error: dErr?.message || pErr?.message };

  const pledgeById = new Map(pledges.map((p) => [p.id, p]));
  const combinedPledgeIds = new Set<string>();

  const rows = [];

  for (const d of donations) {
    const c = oneContact(d.contacts);
    const linkedPledge = d.pledge_id ? pledgeById.get(d.pledge_id) : undefined;
    const contactName = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim();
    if (linkedPledge && !combinedPledgeIds.has(linkedPledge.id)) {
      combinedPledgeIds.add(linkedPledge.id);
      rows.push({
        "סוג רשומה": "התחייבות ותשלום",
        "תאריך": linkedPledge.pledge_date,
        "שם איש קשר": contactName,
        "טלפון": c?.phone ?? "",
        "עיר": c?.city ?? "",
        "קטגוריה / ייעוד": linkedPledge.category ?? "",
        "חובה (התחייבות)": linkedPledge.amount,
        "מטבע חובה": linkedPledge.currency,
        "זכות (תשלום)": d.amount,
        "מטבע זכות": d.currency,
        "מוקד תשלום": d.payment_hub ?? linkedPledge.payment_hub ?? "",
        "אופן תשלום": d.payment_method ?? "",
        "סטטוס": d.status ?? "",
        "הערות": d.notes ?? linkedPledge.details ?? "",
      });
    } else {
      rows.push({
        "סוג רשומה": "תשלום",
        "תאריך": d.donation_date,
        "שם איש קשר": contactName,
        "טלפון": c?.phone ?? "",
        "עיר": c?.city ?? "",
        "קטגוריה / ייעוד": d.purpose ?? "",
        "חובה (התחייבות)": "",
        "מטבע חובה": "",
        "זכות (תשלום)": d.amount,
        "מטבע זכות": d.currency,
        "מוקד תשלום": d.payment_hub ?? "",
        "אופן תשלום": d.payment_method ?? "",
        "סטטוס": d.status ?? "",
        "הערות": d.notes ?? "",
      });
    }
  }

  for (const p of pledges) {
    if (combinedPledgeIds.has(p.id)) continue;
    const c = oneContact(p.contacts);
    rows.push({
      "סוג רשומה": "התחייבות",
      "תאריך": p.pledge_date,
      "שם איש קשר": `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
      "טלפון": c?.phone ?? "",
      "עיר": c?.city ?? "",
      "קטגוריה / ייעוד": p.category ?? "",
      "חובה (התחייבות)": p.amount,
      "מטבע חובה": p.currency,
      "זכות (תשלום)": "",
      "מטבע זכות": "",
      "מוקד תשלום": p.payment_hub ?? "",
      "אופן תשלום": "",
      "סטטוס": p.status ?? "",
      "הערות": p.details ?? "",
    });
  }

  rows.sort((a, b) => (a["תאריך"] < b["תאריך"] ? 1 : -1));
  return { ok: true, rows };
}
