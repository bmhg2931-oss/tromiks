import { createClient } from "@/lib/supabase/server";
import {
  canEditDonations,
  canSeeDonations,
  DONATION_COLUMN_ORDER,
  DONATION_COLUMN_LABELS,
  DONATION_MANDATORY_COLUMNS,
  DEFAULT_VISIBLE_DONATION_FIELDS,
  type UserRole,
  type UnifiedDonationRow,
} from "@/lib/types";
import { stripLeadingZeros } from "@/lib/validation";
import DonationFilterForm from "@/components/DonationFilterForm";
import AddDonationModal from "@/components/AddDonationModal";
import DonationRow from "@/components/DonationRow";

export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
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

  const [{ data: fullProfile }, { data: categories }, { data: handlers }, { data: fieldSettings }] = await Promise.all([
    supabase.from("profiles").select("default_payment_hub, default_currency").eq("id", user!.id).single(),
    supabase.from("donation_categories").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
    supabase.from("donation_handlers").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
    supabase.from("donation_field_settings").select("visible_fields").eq("id", true).single(),
  ]);
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
    if (linkedPledge && !combinedPledgeIds.has(linkedPledge.id)) {
      combinedPledgeIds.add(linkedPledge.id);
      combinedRows.push({
        id: `${linkedPledge.id}-${d.id}`,
        contact_id: d.contact_id,
        contactName,
        contactPhone,
        contactCity,
        contactExtra,
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
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const words = q?.trim().split(/\s+/).filter(Boolean) ?? [];
  const filtered = words.length
    ? rows.filter((r) =>
        words.every((w) => {
          const word = w.toLowerCase();
          const phoneWord = stripLeadingZeros(word);
          return r.contactName.toLowerCase().includes(word) || r.contactPhone.includes(phoneWord);
        })
      )
    : rows;

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold">ניהול תרומות ותשלומים</h1>
          <p className="text-sm text-ink-soft mt-1">רישום, מעקב וסיווג של כל התחייבות ותשלום</p>
        </div>
        {editable && (
          <AddDonationModal
            categories={categories ?? []}
            handlers={handlers ?? []}
            defaultHub={defaultHub}
            defaultCurrency={defaultCurrency}
          />
        )}
      </div>

      <DonationFilterForm q={q} status={status} />

      {(error || pledgesError) && (
        <p className="text-wine text-sm mb-4">שגיאה בטעינת נתונים: {error?.message || pledgesError?.message}</p>
      )}

      <div className="bg-white border border-line rounded-xl shadow overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
            <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
              <th className="py-2.5 px-1.5 bg-white rounded-tr-xl">סוג רשומה</th>
              {columns.map((key, i) => (
                <th
                  key={key}
                  className={`p-2.5 bg-white ${key === "date" || key === "name" ? "text-center" : ""} ${key === "city" ? "pr-5" : ""} ${i === columns.length - 1 ? "rounded-tl-xl" : ""}`}
                >
                  {DONATION_COLUMN_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((r, i) => (
                <DonationRow
                  key={`${r.recordType}-${r.id}`}
                  row={r}
                  categories={categories ?? []}
                  handlers={handlers ?? []}
                  editable={editable}
                  columns={columns}
                  showGregorianDate={showGregorianDate}
                  showHebrewDate={showHebrewDate}
                  even={i % 2 === 0}
                />
              ))
            ) : (
              <tr>
                <td colSpan={1 + columns.length} className="text-center text-ink-soft p-8">
                  לא נמצאו רשומות תואמות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
