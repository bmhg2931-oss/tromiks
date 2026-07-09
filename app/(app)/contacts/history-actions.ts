"use server";

import { createClient } from "@/lib/supabase/server";
import type { Donation, Pledge } from "@/lib/types";

export type ContactHistoryRow = {
  id: string;
  date: string;
  recordType: "pledge" | "payment" | "combined";
  debitAmount: number | null;
  debitCurrency: string | null;
  creditAmount: number | null;
  creditCurrency: string | null;
  category: string | null;
  paymentMethod: string | null;
  paymentHub: string | null;
  handler: string | null;
  status: string | null;
  notes: string | null;
  followUp: string | null;
  pledge?: Pledge;
  donation?: Donation;
};

type HistoryResult = { ok: boolean; rows?: ContactHistoryRow[]; error?: string };

// אותו היגיון איחוד תשלום+התחייבות שבמסך "תרומות ותשלומים" הראשי (app/(app)/donations/page.tsx),
// אך ממוקד לאיש קשר בודד. שולף שורות מלאות (לא רק שדות שטוחים) כדי שלשונית ההיסטוריה תוכל
// לפתוח את אותם חלונות עריכה (Pledge/Donation/CombinedDetailModal) בלחיצה על רשומה
export async function fetchContactHistory(contactId: string): Promise<HistoryResult> {
  const supabase = await createClient();
  const [{ data: donations, error: dErr }, { data: pledges, error: pErr }] = await Promise.all([
    supabase
      .from("donations")
      .select("*")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("donation_date", { ascending: false }),
    supabase
      .from("pledges")
      .select("*")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("pledge_date", { ascending: false }),
  ]);
  if (dErr || pErr) return { ok: false, error: dErr?.message || pErr?.message };

  const pledgeById = new Map((pledges ?? []).map((p) => [p.id, p as Pledge]));
  const combinedIds = new Set<string>();
  const rows: ContactHistoryRow[] = [];

  for (const d of (donations ?? []) as Donation[]) {
    const linked = d.pledge_id ? pledgeById.get(d.pledge_id) : undefined;
    if (linked && !combinedIds.has(linked.id)) {
      combinedIds.add(linked.id);
      rows.push({
        id: `${linked.id}-${d.id}`,
        date: linked.pledge_date,
        recordType: "combined",
        debitAmount: linked.amount,
        debitCurrency: linked.currency || "₪",
        creditAmount: d.amount,
        creditCurrency: d.currency || "₪",
        category: linked.category,
        paymentMethod: d.payment_method,
        paymentHub: d.payment_hub ?? linked.payment_hub,
        handler: linked.handler,
        status: d.status,
        notes: d.notes ?? linked.details,
        followUp: d.follow_up ?? linked.follow_up,
        pledge: linked,
        donation: d,
      });
    } else {
      rows.push({
        id: d.id,
        date: d.donation_date,
        recordType: "payment",
        debitAmount: null,
        debitCurrency: null,
        creditAmount: d.amount,
        creditCurrency: d.currency || "₪",
        category: d.purpose,
        paymentMethod: d.payment_method,
        paymentHub: d.payment_hub,
        handler: null,
        status: d.status,
        notes: d.notes,
        followUp: d.follow_up,
        donation: d,
      });
    }
  }

  for (const p of (pledges ?? []) as Pledge[]) {
    if (combinedIds.has(p.id)) continue;
    rows.push({
      id: p.id,
      date: p.pledge_date,
      recordType: "pledge",
      debitAmount: p.amount,
      debitCurrency: p.currency || "₪",
      creditAmount: null,
      creditCurrency: null,
      category: p.category,
      paymentMethod: null,
      paymentHub: p.payment_hub,
      handler: p.handler,
      status: p.status,
      notes: p.details,
      followUp: p.follow_up,
      pledge: p,
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { ok: true, rows };
}
