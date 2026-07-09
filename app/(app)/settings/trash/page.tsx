import { createClient } from "@/lib/supabase/server";
import TrashList, { type TrashItem } from "@/components/TrashList";

function money(amount: number, currency: string) {
  return `${currency}${Number(amount).toLocaleString("he-IL")}`;
}

export default async function TrashSettingsPage() {
  const supabase = await createClient();

  const [
    { data: contacts },
    { data: donations },
    { data: pledges },
    { data: categories },
    { data: handlers },
    { data: cities },
    { data: files },
    { data: campaigns },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, phone, deleted_at, deleted_by").not("deleted_at", "is", null),
    supabase
      .from("donations")
      .select("id, amount, currency, purpose, donation_date, deleted_at, deleted_by, contacts(first_name, last_name)")
      .not("deleted_at", "is", null),
    supabase
      .from("pledges")
      .select("id, amount, currency, category, pledge_date, deleted_at, deleted_by, contacts(first_name, last_name)")
      .not("deleted_at", "is", null),
    supabase.from("donation_categories").select("id, name, deleted_at, deleted_by").not("deleted_at", "is", null),
    supabase.from("donation_handlers").select("id, name, deleted_at, deleted_by").not("deleted_at", "is", null),
    supabase.from("contact_cities").select("id, city, country, deleted_at, deleted_by").not("deleted_at", "is", null),
    supabase
      .from("contact_files")
      .select("id, file_name, deleted_at, deleted_by, contacts(first_name, last_name)")
      .not("deleted_at", "is", null),
    supabase.from("campaigns").select("id, name, goal_amount, goal_currency, deleted_at, deleted_by").not("deleted_at", "is", null),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "משתמש לא ידוע"]));
  const deleterName = (id: string | null) => (id ? nameById.get(id) ?? "משתמש לא ידוע" : "לא ידוע");

  const items: TrashItem[] = [
    ...(contacts ?? []).map((c): TrashItem => ({
      id: c.id,
      table: "contacts",
      typeLabel: "איש קשר",
      title: `${c.first_name} ${c.last_name}`.trim(),
      subtitle: c.phone || undefined,
      deletedAt: c.deleted_at!,
      deletedByName: deleterName(c.deleted_by),
      details: { "שם מלא": `${c.first_name} ${c.last_name}`.trim(), טלפון: c.phone },
    })),
    ...(donations ?? []).map((d): TrashItem => {
      const dc = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
      const contactName = `${dc?.first_name ?? ""} ${dc?.last_name ?? ""}`.trim();
      return {
        id: d.id,
        table: "donations",
        typeLabel: "תשלום",
        title: money(d.amount, d.currency),
        subtitle: [contactName, d.purpose].filter(Boolean).join(" · "),
        deletedAt: d.deleted_at!,
        deletedByName: deleterName(d.deleted_by),
        details: { סכום: money(d.amount, d.currency), ייעוד: d.purpose, "איש קשר": contactName, תאריך: d.donation_date },
      };
    }),
    ...(pledges ?? []).map((p): TrashItem => {
      const pc = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
      const contactName = `${pc?.first_name ?? ""} ${pc?.last_name ?? ""}`.trim();
      return {
        id: p.id,
        table: "pledges",
        typeLabel: "התחייבות",
        title: money(p.amount, p.currency),
        subtitle: [contactName, p.category].filter(Boolean).join(" · "),
        deletedAt: p.deleted_at!,
        deletedByName: deleterName(p.deleted_by),
        details: { סכום: money(p.amount, p.currency), קטגוריה: p.category, "איש קשר": contactName, תאריך: p.pledge_date },
      };
    }),
    ...(categories ?? []).map((c): TrashItem => ({
      id: c.id,
      table: "donation_categories",
      typeLabel: "קטגוריה",
      title: c.name,
      deletedAt: c.deleted_at!,
      deletedByName: deleterName(c.deleted_by),
      details: { שם: c.name },
    })),
    ...(handlers ?? []).map((h): TrashItem => ({
      id: h.id,
      table: "donation_handlers",
      typeLabel: "מטפל",
      title: h.name,
      deletedAt: h.deleted_at!,
      deletedByName: deleterName(h.deleted_by),
      details: { שם: h.name },
    })),
    ...(cities ?? []).map((c): TrashItem => ({
      id: c.id,
      table: "contact_cities",
      typeLabel: "עיר",
      title: c.city,
      subtitle: c.country,
      deletedAt: c.deleted_at!,
      deletedByName: deleterName(c.deleted_by),
      details: { עיר: c.city, ארץ: c.country },
    })),
    ...(files ?? []).map((f): TrashItem => {
      const fc = Array.isArray(f.contacts) ? f.contacts[0] : f.contacts;
      const contactName = fc ? `${fc.first_name ?? ""} ${fc.last_name ?? ""}`.trim() : "";
      return {
        id: f.id,
        table: "contact_files",
        typeLabel: "קובץ מצורף",
        title: f.file_name,
        subtitle: contactName || undefined,
        deletedAt: f.deleted_at!,
        deletedByName: deleterName(f.deleted_by),
        details: { "שם קובץ": f.file_name, "איש קשר": contactName },
      };
    }),
    ...(campaigns ?? []).map((c): TrashItem => ({
      id: c.id,
      table: "campaigns",
      typeLabel: "קמפיין",
      title: c.name,
      subtitle: c.goal_amount ? `יעד: ${money(c.goal_amount, c.goal_currency)}` : undefined,
      deletedAt: c.deleted_at!,
      deletedByName: deleterName(c.deleted_by),
      details: { שם: c.name, יעד: c.goal_amount ? money(c.goal_amount, c.goal_currency) : "—" },
    })),
  ].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));

  return (
    <div>
      <h2 className="font-serif text-lg font-bold mb-1">פריטים שנמחקו</h2>
      <p className="text-sm text-ink-soft mb-4">
        כל הפריטים שנמחקו במערכת (אנשי קשר, תרומות, התחייבויות, קטגוריות, מטפלים, ערים וקבצים מצורפים) במקום אחד.
        אפשר לפתוח כל פריט לצפייה בפרטים ומי מחק אותו ומתי, ולשחזר בכל עת.
      </p>
      <TrashList items={items} />
    </div>
  );
}
