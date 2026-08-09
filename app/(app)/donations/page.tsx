import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  canEditDonations,
  canSeeDonations,
  DONATION_COLUMN_ORDER,
  DONATION_MANDATORY_COLUMNS,
  DEFAULT_VISIBLE_DONATION_FIELDS,
  type UserRole,
  type UnifiedDonationRow,
  type Contact,
} from "@/lib/types";
import { stripLeadingZeros } from "@/lib/validation";
import { fetchAllRows } from "@/lib/fetchAllRows";
import DonationFilterForm from "@/components/DonationFilterForm";
import AddDonationModal from "@/components/AddDonationModal";
import DonationsTable from "@/components/DonationsTable";
import StripeCheckoutReturnBanner from "@/components/StripeCheckoutReturnBanner";

export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    recordType?: string;
    category?: string;
    city?: string;
    paymentHub?: string;
    amountMin?: string;
    amountMax?: string;
  }>;
}) {
  const { q, status, recordType, category, city, paymentHub, amountMin, amountMax } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;

  if (!canSeeDonations(role)) {
    return (
      <div className="bg-white border border-wine/40 rounded-xl p-6 text-wine text-sm">
        אין לתפקיד הנוכחי הרשאה לצפות במודול זה.
      </div>
    );
  }

  const editable = canEditDonations(role);

  const [{ data: fullProfile }, { data: categories }, { data: handlers }, { data: fieldSettings }, { data: cityRows }] =
    await Promise.all([
      supabase.from("profiles").select("default_payment_hub, default_currency").eq("id", user!.id).single(),
      supabase.from("donation_categories").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
      supabase.from("donation_handlers").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
      supabase.from("donation_field_settings").select("visible_fields").eq("id", true).single(),
      fetchAllRows<{ city: string | null }>(() => supabase.from("contacts").select("city").not("city", "is", null).is("deleted_at", null)),
    ]);
  const availableCategories = (categories ?? []).map((c) => c.name);
  const availableCities = Array.from(new Set((cityRows ?? []).map((r) => r.city).filter((c): c is string => Boolean(c)))).sort((a, b) =>
    a.localeCompare(b, "he")
  );
  const defaultHub = fullProfile?.default_payment_hub || "ישראל";
  const defaultCurrency = fullProfile?.default_currency || "₪";
  const visibleFields = new Set(fieldSettings?.visible_fields ?? DEFAULT_VISIBLE_DONATION_FIELDS);
  // תאריך לועזי ותאריך עברי משותפים בעמודת "date" אחת (מוצג אחד מתחת לשני כשגם וגם מסומנים)
  const showGregorianDate = visibleFields.has("date");
  const showHebrewDate = visibleFields.has("hebrew_date");

  // סדר עמודות קבוע: חובה (שם, סכום) תמיד מופיעות, אופציונליות מסוננות לפי הגדרות התצוגה
  const columns = DONATION_COLUMN_ORDER.filter((key) => {
    if (DONATION_MANDATORY_COLUMNS.has(key)) return true;
    if (key === "date") return showGregorianDate || showHebrewDate;
    return visibleFields.has(key);
  });

  let donationsQuery = supabase
    .from("donations")
    .select("*, contacts(*)")
    .is("deleted_at", null)
    .order("donation_date", { ascending: false });
  if (status) donationsQuery = donationsQuery.eq("status", status);
  let pledgesQuery = supabase
    .from("pledges")
    .select("*, contacts(*)")
    .is("deleted_at", null)
    .order("pledge_date", { ascending: false });
  if (status) pledgesQuery = pledgesQuery.eq("status", status);

  const [{ data: donations, error }, { data: pledges, error: pledgesError }] = await Promise.all([
    donationsQuery,
    pledgesQuery,
  ]);

  // תשלומים המשויכים ל-pledge_id נוצרים תמיד יחד עם ההתחייבות שלהם באותה פעולה (זרימת
  // "התחייבות ותשלום") - לכן הם מוצגים כרשומה מאוחדת אחת, ולא מוסרים מהחישוב האגרגטיבי
  // הכולל (שממשיך לספור את הסכום המלא של כל אחד מהם בנפרד).
  const pledgeById = new Map((pledges || []).map((p) => [p.id, p]));
  const combinedPledgeIds = new Set<string>();

  const combinedRows: UnifiedDonationRow[] = [];
  const paymentRows: UnifiedDonationRow[] = [];
  for (const d of donations || []) {
    const linkedPledge = d.pledge_id ? pledgeById.get(d.pledge_id) : undefined;
    const contactName = `${d.contacts?.first_name ?? ""} ${d.contacts?.last_name ?? ""}`.trim();
    const contactPhone = d.contacts?.phone ?? "";
    const contactCity = d.contacts?.city ?? null;
    const contactExtra = d.contacts ?? null;
    const contact = (d.contacts as unknown as Contact) ?? null;
    if (linkedPledge && !combinedPledgeIds.has(linkedPledge.id)) {
      combinedPledgeIds.add(linkedPledge.id);
      combinedRows.push({
        id: `${linkedPledge.id}-${d.id}`,
        contact_id: d.contact_id,
        contactName,
        contactPhone,
        contactCity,
        contactExtra,
        contact,
        date: linkedPledge.pledge_date,
        recordType: "combined",
        debitAmount: linkedPledge.amount,
        debitCurrency: linkedPledge.currency || "₪",
        creditAmount: d.amount,
        creditCurrency: d.currency || "₪",
        paymentMethod: d.payment_method,
        handler: linkedPledge.handler,
        category: linkedPledge.category,
        paymentHub: d.payment_hub,
        status: d.status,
        notes: d.notes ?? linkedPledge.details,
        pledge: linkedPledge,
        donation: d,
      });
    } else {
      paymentRows.push({
        id: d.id,
        contact_id: d.contact_id,
        contactName,
        contactPhone,
        contactCity,
        contactExtra,
        contact,
        date: d.donation_date,
        recordType: "payment",
        debitAmount: null,
        debitCurrency: null,
        creditAmount: d.amount,
        creditCurrency: d.currency || "₪",
        paymentMethod: d.payment_method,
        handler: null,
        category: d.purpose,
        paymentHub: d.payment_hub,
        status: d.status,
        notes: d.notes,
        donation: d,
      });
    }
  }

  const rows: UnifiedDonationRow[] = [
    ...paymentRows,
    ...combinedRows,
    ...(pledges || [])
      .filter((p) => !combinedPledgeIds.has(p.id))
      .map((p): UnifiedDonationRow => ({
        id: p.id,
        contact_id: p.contact_id,
        contactName: `${p.contacts?.first_name ?? ""} ${p.contacts?.last_name ?? ""}`.trim(),
        contactPhone: p.contacts?.phone ?? "",
        contactCity: p.contacts?.city ?? null,
        contactExtra: p.contacts ?? null,
        contact: (p.contacts as unknown as Contact) ?? null,
        date: p.pledge_date,
        recordType: "pledge",
        debitAmount: p.amount,
        debitCurrency: p.currency || "₪",
        creditAmount: null,
        creditCurrency: null,
        paymentMethod: null,
        handler: p.handler,
        category: p.category,
        paymentHub: null,
        status: p.status,
        notes: p.details,
        pledge: p,
      })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aTs = a.donation?.created_at ?? a.pledge?.created_at ?? "";
    const bTs = b.donation?.created_at ?? b.pledge?.created_at ?? "";
    return aTs < bTs ? 1 : aTs > bTs ? -1 : 0;
  });

  const words = q?.trim().split(/\s+/).filter(Boolean) ?? [];
  const min = amountMin ? Number(amountMin) : null;
  const max = amountMax ? Number(amountMax) : null;
  const filtered = rows.filter((r) => {
    if (words.length > 0) {
      const matchesSearch = words.every((w) => {
        const word = w.toLowerCase();
        const phoneWord = stripLeadingZeros(word);
        return r.contactName.toLowerCase().includes(word) || r.contactPhone.includes(phoneWord);
      });
      if (!matchesSearch) return false;
    }
    if (recordType && r.recordType !== recordType) return false;
    if (category && r.category !== category) return false;
    if (city && r.contactCity !== city) return false;
    if (paymentHub && r.paymentHub !== paymentHub) return false;
    if (min != null || max != null) {
      const amounts = [r.debitAmount, r.creditAmount].filter((a): a is number => a != null);
      const matchesAmount = amounts.some((a) => (min == null || a >= min) && (max == null || a <= max));
      if (!matchesAmount) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-3">
        <h1 className="font-serif text-5xl font-bold">תרומות ותשלומים</h1>
        <p className="text-sm text-ink-soft mt-1">ניהול ומעקב נדרים ונדבות</p>
      </div>

      <Suspense fallback={null}>
        <StripeCheckoutReturnBanner />
      </Suspense>

      <div className="flex items-start flex-wrap gap-3 mb-5">
        <DonationFilterForm
          q={q}
          status={status}
          recordType={recordType}
          category={category}
          city={city}
          paymentHub={paymentHub}
          amountMin={amountMin}
          amountMax={amountMax}
          resultCount={filtered.length}
          totalCount={rows.length}
          availableCategories={availableCategories}
          availableCities={availableCities}
        />

        {editable && (
          <div className="mr-auto">
            <AddDonationModal
              categories={categories ?? []}
              handlers={handlers ?? []}
              defaultHub={defaultHub}
              defaultCurrency={defaultCurrency}
            />
          </div>
        )}
      </div>

      {(error || pledgesError) && (
        <p className="text-wine text-sm mb-4">שגיאה בטעינת נתונים: {error?.message || pledgesError?.message}</p>
      )}

      <DonationsTable
        rows={filtered}
        categories={categories ?? []}
        handlers={handlers ?? []}
        editable={editable}
        columns={columns}
        showGregorianDate={showGregorianDate}
        showHebrewDate={showHebrewDate}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}
