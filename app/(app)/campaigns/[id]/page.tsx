import { createClient } from "@/lib/supabase/server";
import { canEditCampaigns, canSeeCampaigns, type Campaign, type Contact, type UserRole } from "@/lib/types";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getContactTotalPledges } from "@/lib/pledgeBalance";
import { getCampaignDirectTotals, rollupCampaignTotals, convertILSAmounts, getFamilyGivingByContact } from "@/lib/campaignBalance";
import { createDimension, deleteDimension, addDimensionLevel, deleteDimensionLevel } from "../mapping-actions";
import CampaignTabsView from "@/components/CampaignTabsView";
import type { CampaignRecordRow } from "@/components/CampaignRecordsTable";
import type { DimensionWithLevels } from "@/components/CampaignDimensionsManager";
import type { MappingContactRow } from "@/components/CampaignMappingTable";
import type { InvitationContactRow } from "@/components/CampaignInvitationTable";
import type { FundraisingContactRow } from "@/components/CampaignFundraisingWorkspace";
import type { PickerContact } from "@/components/CampaignAudiencePickerModal";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function fetchDirectRecords(supabase: Supabase, campaignId: string): Promise<CampaignRecordRow[]> {
  const [{ data: pledges }, { data: donations }] = await Promise.all([
    supabase
      .from("pledges")
      .select("id, contact_id, amount, currency, pledge_date, category, contacts(first_name, last_name, phone)")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null),
    supabase
      .from("donations")
      .select("id, contact_id, amount, currency, donation_date, purpose, contacts(first_name, last_name, phone)")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null),
  ]);

  const rows: CampaignRecordRow[] = [
    ...(pledges ?? []).map((p): CampaignRecordRow => {
      const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
      return {
        id: p.id,
        contactId: p.contact_id,
        contactName: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
        contactPhone: c?.phone ?? "",
        type: "pledge",
        amount: p.amount,
        currency: p.currency,
        date: p.pledge_date,
        category: p.category,
      };
    }),
    ...(donations ?? []).map((d): CampaignRecordRow => {
      const c = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
      return {
        id: d.id,
        contactId: d.contact_id,
        contactName: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
        contactPhone: c?.phone ?? "",
        type: "donation",
        amount: d.amount,
        currency: d.currency,
        date: d.donation_date,
        category: d.purpose,
      };
    }),
  ];
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, default_payment_hub, default_currency")
    .eq("id", user!.id)
    .single();
  const role = (profile?.role ?? "secretary") as UserRole;

  if (!canSeeCampaigns(role)) {
    return <p className="text-sm text-wine">אין לך הרשאה לצפות בקמפיינים.</p>;
  }
  const editable = canEditCampaigns(role);
  const defaultHub = profile?.default_payment_hub || "ישראל";
  const defaultCurrency = profile?.default_currency || "₪";

  const { data: campaignRow } = await supabase.from("campaigns").select("*").eq("id", id).is("deleted_at", null).single();
  if (!campaignRow) {
    return <p className="text-sm text-wine">הקמפיין לא נמצא.</p>;
  }
  const campaign = campaignRow as Campaign;
  const isSubCampaign = Boolean(campaign.parent_campaign_id);

  const [
    parentRes,
    childrenRes,
    siblingsRes,
    records,
    direct,
    { data: categories },
    { data: handlers },
    { data: otherCampaignsRows },
    { data: campaignCategoryRow },
  ] = await Promise.all([
    isSubCampaign
      ? supabase.from("campaigns").select("id, name").eq("id", campaign.parent_campaign_id!).single()
      : Promise.resolve({ data: null }),
    !isSubCampaign
      ? supabase.from("campaigns").select("*").eq("parent_campaign_id", campaign.id).is("deleted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    isSubCampaign
      ? supabase.from("campaigns").select("id").eq("parent_campaign_id", campaign.parent_campaign_id!).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    fetchDirectRecords(supabase, campaign.id),
    getCampaignDirectTotals(supabase),
    supabase.from("donation_categories").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
    supabase.from("donation_handlers").select("id, name").eq("active", true).is("deleted_at", null).order("sort_order"),
    supabase.from("campaigns").select("id, name").neq("id", id).is("deleted_at", null).order("name"),
    supabase.from("donation_categories").select("name").eq("campaign_id", campaign.id).maybeSingle(),
  ]);

  const parent = parentRes.data as { id: string; name: string } | null;
  const childCampaigns = (childrenRes.data ?? []) as Campaign[];
  const otherCampaignsForImport = otherCampaignsRows ?? [];
  const campaignCategoryName = campaignCategoryRow?.name ?? null;

  const rolled = rollupCampaignTotals([campaign, ...childCampaigns], direct);
  const currencyByCampaign = new Map([
    [campaign.id, campaign.goal_currency],
    ...childCampaigns.map((c): [string, string] => [c.id, c.goal_currency]),
  ]);
  const converted = await convertILSAmounts(rolled, currencyByCampaign);
  const raised = converted.get(campaign.id)?.paid ?? 0;
  const children = childCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    goal_amount: c.goal_amount,
    goal_currency: c.goal_currency,
    raised: converted.get(c.id)?.paid ?? 0,
  }));

  // נתוני הטאבים "מיפוי"/"הזמנה"/"התרמה" נשלפים תמיד (גם אם לא מוצגים, כדי לשמור
  // קוד פשוט) - רק בעלי הרשאת עריכה בפועל רואים את מיפוי/הזמנה (ראו סינון ב-CampaignTabsView)
  let dimensions: DimensionWithLevels[] = [];
  let mappingContacts: MappingContactRow[] = [];
  let invitationContacts: InvitationContactRow[] = [];
  let fundraisingContacts: FundraisingContactRow[] = [];
  let allContactsForPicker: PickerContact[] = [];

  if (editable) {
    // קהל היעד: בחירה ידנית גוברת על סינון לפי מחלקה; ריק בשניהם = כל אנשי הקשר
    let contactsQuery = supabase.from("contacts").select("*").is("deleted_at", null).order("last_name");
    if (campaign.audience_mode === "manual" && campaign.included_contact_ids && campaign.included_contact_ids.length > 0) {
      contactsQuery = contactsQuery.in("id", campaign.included_contact_ids);
    } else if (campaign.audience_mode === "department" && campaign.included_departments && campaign.included_departments.length > 0) {
      contactsQuery = contactsQuery.in("department", campaign.included_departments);
    }

    // עבור תת-קמפיין: "משפחת הקמפיין" = קמפיין-האב + כל תתי-הקמפיינים שלו (כולל זה),
    // כדי להראות לממפה כמה כל איש קשר כבר תרם לכל המאמץ הזה
    const familyCampaignIds = isSubCampaign
      ? [campaign.parent_campaign_id!, ...(siblingsRes.data ?? []).map((s) => s.id)]
      : [];

    const [
      { data: dimensionRows },
      { data: levelRows },
      { data: contactRows },
      { data: mappingRows },
      { data: scoreRows },
      referenceILS,
      { data: invitationRows },
      { data: allContactRows },
    ] = await Promise.all([
      supabase.from("campaign_mapping_dimensions").select("id, name").eq("campaign_id", id).order("sort_order"),
      supabase.from("campaign_mapping_dimension_levels").select("id, dimension_id, label").order("sort_order"),
      fetchAllRows<Contact>(() => contactsQuery),
      supabase
        .from("campaign_contact_mappings")
        .select("id, contact_id, target_amount, potential_amount, status, notes")
        .eq("campaign_id", id),
      supabase.from("campaign_contact_dimension_scores").select("mapping_id, dimension_id, level_id"),
      isSubCampaign ? getFamilyGivingByContact(supabase, familyCampaignIds) : getContactTotalPledges(supabase),
      supabase.from("campaign_contact_invitations").select("contact_id, status").eq("campaign_id", id),
      fetchAllRows<{ id: string; first_name: string; last_name: string; phone: string; department: string | null }>(() =>
        supabase.from("contacts").select("id, first_name, last_name, phone, department").is("deleted_at", null).order("last_name")
      ),
    ]);

    allContactsForPicker = allContactRows ?? [];
    const referenceLabel = isSubCampaign ? "תרם למשפחת הקמפיין" : "סך כל ההתחייבויות";

    const levelsByDimension = new Map<string, { id: string; label: string }[]>();
    const levelLabelById = new Map<string, string>();
    for (const l of levelRows ?? []) {
      const list = levelsByDimension.get(l.dimension_id) ?? [];
      list.push({ id: l.id, label: l.label });
      levelsByDimension.set(l.dimension_id, list);
      levelLabelById.set(l.id, l.label);
    }
    dimensions = (dimensionRows ?? []).map((d) => ({ id: d.id, name: d.name, levels: levelsByDimension.get(d.id) ?? [] }));
    const dimensionNameById = new Map((dimensionRows ?? []).map((d) => [d.id, d.name]));

    const mappingByContact = new Map((mappingRows ?? []).map((m) => [m.contact_id, m]));
    const mappingIdToContact = new Map((mappingRows ?? []).map((m) => [m.id, m.contact_id]));
    const scoresByContact = new Map<string, Record<string, string>>();
    for (const s of scoreRows ?? []) {
      const contactId = mappingIdToContact.get(s.mapping_id);
      if (!contactId) continue;
      const map = scoresByContact.get(contactId) ?? {};
      map[s.dimension_id] = s.level_id;
      scoresByContact.set(contactId, map);
    }

    mappingContacts = (contactRows ?? []).map((c) => {
      const mapping = mappingByContact.get(c.id);
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        tags: c.tags ?? [],
        fullContact: c,
        referenceLabel,
        referenceAmountILS: referenceILS.get(c.id) ?? 0,
        target_amount: mapping?.target_amount ?? null,
        potential_amount: mapping?.potential_amount ?? null,
        status: mapping?.status ?? "טרם טופל",
        notes: mapping?.notes ?? "",
        scores: scoresByContact.get(c.id) ?? {},
      };
    });

    const invitationByContact = new Map((invitationRows ?? []).map((r) => [r.contact_id, r.status]));
    invitationContacts = (contactRows ?? []).map((c) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      email: c.email,
      status: invitationByContact.get(c.id) ?? "לא הוזמן",
    }));

    fundraisingContacts = (contactRows ?? []).map((c) => {
      const mapping = mappingByContact.get(c.id);
      const scores = scoresByContact.get(c.id) ?? {};
      const mappingSummary = [
        { label: "יעד", value: mapping?.target_amount != null ? `₪${Math.round(mapping.target_amount).toLocaleString("he-IL")}` : "—" },
        { label: "פוטנציאל", value: mapping?.potential_amount != null ? `₪${Math.round(mapping.potential_amount).toLocaleString("he-IL")}` : "—" },
        ...Object.entries(scores).map(([dimId, levelId]) => ({
          label: dimensionNameById.get(dimId) ?? "",
          value: levelLabelById.get(levelId) ?? "",
        })),
      ];
      return {
        contact: c,
        target_amount: mapping?.target_amount ?? null,
        potential_amount: mapping?.potential_amount ?? null,
        status: mapping?.status ?? "טרם טופל",
        notes: mapping?.notes ?? "",
        mappingSummary,
      };
    });
  }

  const boundCreateDimension = createDimension.bind(null, id);
  const boundDeleteDimension = deleteDimension.bind(null, id);
  const boundAddLevel = addDimensionLevel.bind(null, id);
  const boundDeleteLevel = deleteDimensionLevel.bind(null, id);

  return (
    <CampaignTabsView
      campaign={campaign}
      editable={editable}
      parent={parent}
      children={children}
      raised={raised}
      records={records}
      dimensions={dimensions}
      mappingContacts={mappingContacts}
      invitationContacts={invitationContacts}
      fundraisingContacts={fundraisingContacts}
      categories={categories ?? []}
      handlers={handlers ?? []}
      defaultHub={defaultHub}
      defaultCurrency={defaultCurrency}
      campaignCategoryName={campaignCategoryName}
      otherCampaignsForImport={otherCampaignsForImport}
      allContacts={allContactsForPicker}
      boundCreateDimension={boundCreateDimension}
      boundDeleteDimension={boundDeleteDimension}
      boundAddLevel={boundAddLevel}
      boundDeleteLevel={boundDeleteLevel}
    />
  );
}
