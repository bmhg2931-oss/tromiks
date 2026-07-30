import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canEditContacts, canSeePledges, CONTACT_FIELD_DEFS, DEFAULT_VISIBLE_FIELDS, type Contact, type UserRole } from "@/lib/types";
import { stripLeadingZeros } from "@/lib/validation";
import { getContactBalances, convertBalanceMap } from "@/lib/pledgeBalance";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { computeContactRestrictions, redactContactFields, type FieldVisibilityRule } from "@/lib/contactVisibility";
import ContactCard from "@/components/ContactCard";
import ContactsTable from "@/components/ContactsTable";
import NewContactModal from "@/components/NewContactModal";
import ContactFilterForm from "@/components/ContactFilterForm";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    view?: string;
    department?: string;
    city?: string;
    street?: string;
    email?: string;
    tags?: string;
    balanceMode?: string;
    balanceAmount?: string;
  }>;
}) {
  const { q, view, department, city, street, email, tags, balanceMode, balanceAmount } = await searchParams;
  const currentView = view === "cards" ? "cards" : "list";
  const tagList = tags ? tags.split(",").filter(Boolean) : [];
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: fieldSettings }, { data: donationCategories }, { data: donationHandlers }] = await Promise.all([
    supabase.from("profiles").select("role, default_payment_hub, default_currency").eq("id", user!.id).single(),
    supabase.from("contact_field_settings").select("visible_fields, show_inactive").eq("id", true).single(),
    supabase.from("donation_categories").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
    supabase.from("donation_handlers").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
  ]);

  const role = (profile?.role ?? "secretary") as UserRole;
  const editable = canEditContacts(role);
  const defaultHub = profile?.default_payment_hub || "ישראל";
  const defaultCurrency = profile?.default_currency || "₪";
  const canFilterBalance = canSeePledges(role);

  const visibleFields = new Set(fieldSettings?.visible_fields ?? DEFAULT_VISIBLE_FIELDS);
  const showInactive = fieldSettings?.show_inactive ?? true;
  const dynamicFields = CONTACT_FIELD_DEFS.filter(
    (f) => visibleFields.has(f.key) && !["first_name", "last_name", "phone"].includes(f.key)
  );
  const compact = dynamicFields.length > 6;

  const words = q?.trim().split(/\s+/).filter(Boolean) ?? [];
  function buildContactsQuery() {
    let q2 = supabase.from("contacts").select("*").is("deleted_at", null).order("last_name").order("first_name");
    if (!showInactive) q2 = q2.eq("status", "פעיל");
    if (department) q2 = q2.eq("department", department);
    if (city) q2 = q2.eq("city", city);
    if (street) q2 = q2.ilike("street", `%${street}%`);
    if (email) q2 = q2.ilike("email", `%${email}%`);
    if (tagList.length > 0) q2 = q2.overlaps("tags", tagList);
    for (const word of words) {
      const w = word.replace(/[,()]/g, "");
      const phoneWord = stripLeadingZeros(w);
      q2 = q2.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,phone.ilike.%${phoneWord}%,email.ilike.%${w}%`);
    }
    return q2;
  }

  const [
    { data: rawContacts, error },
    { count: totalCount },
    contactBalances,
    { data: cityRows },
    { data: tagRows },
    { data: visibilityRules },
  ] = await Promise.all([
    fetchAllRows<Contact>(buildContactsQuery),
    supabase.from("contacts").select("*", { count: "exact", head: true }).is("deleted_at", null),
    canFilterBalance ? getContactBalances(supabase) : Promise.resolve(new Map<string, number>()),
    fetchAllRows<{ city: string | null }>(() => supabase.from("contacts").select("city").not("city", "is", null).is("deleted_at", null)),
    fetchAllRows<{ tags: string[] }>(() => supabase.from("contacts").select("tags").is("deleted_at", null)),
    supabase
      .from("contact_visibility_rules")
      .select("tag, scope_type, role, user_id, hide_contact, hidden_fields, hidden_sections"),
  ]);

  const displayBalances = canFilterBalance ? await convertBalanceMap(contactBalances, defaultCurrency) : contactBalances;
  const balancesRecord: Record<string, number> = Object.fromEntries(displayBalances);

  let contacts = (rawContacts ?? []).map((c) => {
    const { hiddenFields } = computeContactRestrictions(c, (visibilityRules ?? []) as FieldVisibilityRule[], user!.id, role);
    return redactContactFields(c, hiddenFields);
  });
  if (canFilterBalance && balanceMode && balanceMode !== "any") {
    const threshold = Number(balanceAmount) || 0;
    contacts = contacts.filter((c) => {
      const bal = contactBalances.get(c.id) ?? 0;
      if (balanceMode === "has") return bal > 0.5;
      if (balanceMode === "none") return bal <= 0.5;
      if (balanceMode === "above") return bal > threshold;
      if (balanceMode === "below") return bal < threshold;
      return true;
    });
  }

  const availableCities = Array.from(new Set(cityRows.map((r) => r.city).filter((c): c is string => Boolean(c)))).sort((a, b) =>
    a.localeCompare(b, "he")
  );
  const availableTags = Array.from(new Set(tagRows.flatMap((r) => r.tags ?? []))).sort((a, b) => a.localeCompare(b, "he"));

  const toggleParams = (v: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (department) params.set("department", department);
    if (city) params.set("city", city);
    if (street) params.set("street", street);
    if (email) params.set("email", email);
    if (tags) params.set("tags", tags);
    if (balanceMode) params.set("balanceMode", balanceMode);
    if (balanceAmount) params.set("balanceAmount", balanceAmount);
    params.set("view", v);
    return `/contacts?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-3">
        <h1 className="font-serif text-5xl font-bold">אנשי קשר</h1>
        <p className="text-sm text-ink-soft mt-1">קהל חסידי טשערנאביל די בכל אתר ואתר</p>
      </div>

      <div className="flex items-start flex-wrap gap-3 mb-5">
        <ContactFilterForm
          q={q}
          department={department}
          city={city}
          street={street}
          email={email}
          tags={tags}
          balanceMode={balanceMode}
          balanceAmount={balanceAmount}
          view={currentView}
          resultCount={contacts.length}
          totalCount={totalCount ?? 0}
          availableCities={availableCities}
          availableTags={availableTags}
          canFilterBalance={canFilterBalance}
        />

        <div className="flex items-center gap-3 mr-auto">
          {editable && <NewContactModal />}

          <div className="flex h-9 border border-line rounded-full overflow-hidden text-sm bg-white shrink-0">
            <Link
              href={toggleParams("list")}
              className={`flex items-center gap-1.5 px-4 transition ${currentView === "list" ? "bg-brass text-white font-semibold" : "text-ink-soft hover:bg-parchment"}`}
            >
              <ListIcon />
              תצוגת רשימה
            </Link>
            <Link
              href={toggleParams("cards")}
              className={`flex items-center gap-1.5 px-4 border-r border-line transition ${currentView === "cards" ? "bg-brass text-white font-semibold" : "text-ink-soft hover:bg-parchment"}`}
            >
              <CardsIcon />
              תצוגת כרטיסים
            </Link>
          </div>
        </div>
      </div>

      {error && <p className="text-wine text-sm mb-4">שגיאה בטעינת אנשי קשר: {error.message}</p>}

      {currentView === "list" ? (
        <ContactsTable
          contacts={contacts}
          fields={dynamicFields}
          editable={editable}
          compact={compact}
          contactBalances={balancesRecord}
          donationCategories={donationCategories ?? []}
          donationHandlers={donationHandlers ?? []}
          defaultHub={defaultHub}
          defaultCurrency={defaultCurrency}
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {contacts.length > 0 ? (
            contacts.map((c) => (
              <ContactCard
                key={c.id}
                c={c}
                editable={editable}
                fields={dynamicFields}
                balance={balancesRecord[c.id] ?? 0}
                donationCategories={donationCategories ?? []}
                donationHandlers={donationHandlers ?? []}
                defaultHub={defaultHub}
                defaultCurrency={defaultCurrency}
              />
            ))
          ) : (
            <div className="col-span-3 text-center text-ink-soft py-10 bg-white border border-line rounded-xl">
              לא נמצאו אנשי קשר תואמים
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}
