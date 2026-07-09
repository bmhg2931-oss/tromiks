import { createClient } from "@/lib/supabase/server";
import { canEditCampaigns, canSeeCampaigns, type Campaign, type UserRole } from "@/lib/types";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getContactBalances } from "@/lib/pledgeBalance";
import { getCampaignDirectTotals, rollupCampaignTotals, convertILSAmounts } from "@/lib/campaignBalance";
import { createDimension, deleteDimension, addDimensionLevel, deleteDimensionLevel } from "../mapping-actions";
import CampaignTabsView from "@/components/CampaignTabsView";
import type { CampaignRecordRow } from "@/components/CampaignRecordsTable";
import type { DimensionWithLevels } from "@/components/CampaignDimensionsManager";
import type { MappingContactRow } from "@/components/CampaignMappingTable";
import type { InvitationContactRow } from "@/components/CampaignInvitationTable";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function fetchDirectRecords(supabase: Supabase, campaignId: string): Promise<CampaignRecordRow[]> {
  const [{ data: pledges }, { data: donations }] = await Promise.all([
    supabase
      .from("pledges")
      .select("id, amount, currency, pledge_date, category, contacts(first_name, last_name, phone)")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null),
    supabase
      .from("donations")
      .select("id, amount, currency, donation_date, purpose, contacts(first_name, last_name, phone)")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null),
  ]);

  const rows: CampaignRecordRow[] = [
    ...(pledges ?? []).map((p): CampaignRecordRow => {
      const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
      return {
        id: p.id,
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
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;

  if (!canSeeCampaigns(role)) {
    return <p className="text-sm text-wine">אין לך הרשאה לצפות בקמפיינים.</p>;
  }
  const editable = canEditCampaigns(role);

  const { data: campaignRow } = await supabase.from("campaigns").select("*").eq("id", id).is("deleted_at", null).single();
  if (!campaignRow) {
    return <p className="text-sm text-wine">הקמפיין לא נמצא.</p>;
  }
  const campaign = campaignRow as Campaign;
  const isSubCampaign = Boolean(campaign.parent_campaign_id);

  const [parentRes, childrenRes, records, direct] = await Promise.all([
    isSubCampaign
      ? supabase.from("campaigns").select("id, name").eq("id", campaign.parent_campaign_id!).single()
      : Promise.resolve({ data: null }),
    !isSubCampaign
      ? supabase.from("campaigns").select("*").eq("parent_campaign_id", campaign.id).is("deleted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    fetchDirectRecords(supabase, campaign.id),
    getCampaignDirectTotals(supabase),
  ]);

  const parent = parentRes.data as { id: string; name: string } | null;
  const childCampaigns = (childrenRes.data ?? []) as Campaign[];

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

  // נתוני הטאבים "מיפוי" ו"הזמנה" נשלפים תמיד (גם אם לא מוצגים, כדי לשמור קוד פשוט) -
  // רק בעלי הרשאת עריכה בפועל רואים את הטאבים האלה (ראו סינון ב-CampaignTabsView
  let dimensions: DimensionWithLevels[] = [];
  let mappingContacts: MappingContactRow[] = [];
  let invitationContacts: InvitationContactRow[] = [];

  if (editable) {
    const [{ data: dimensionRows }, { data: levelRows }, { data: contactRows }, { data: mappingRows }, { data: scoreRows }, balances, { data: invitationRows }] =
      await Promise.all([
        supabase.from("campaign_mapping_dimensions").select("id, name").eq("campaign_id", id).order("sort_order"),
        supabase.from("campaign_mapping_dimension_levels").select("id, dimension_id, label").order("sort_order"),
        fetchAllRows<{ id: string; first_name: string; last_name: string; phone: string; tags: string[] }>(() =>
          supabase.from("contacts").select("id, first_name, last_name, phone, tags").is("deleted_at", null).order("last_name")
        ),
        supabase
          .from("campaign_contact_mappings")
          .select("id, contact_id, target_amount, potential_amount, status, notes")
          .eq("campaign_id", id),
        supabase.from("campaign_contact_dimension_scores").select("mapping_id, dimension_id, level_id"),
        getContactBalances(supabase),
        supabase.from("campaign_contact_invitations").select("contact_id, status").eq("campaign_id", id),
      ]);

    const levelsByDimension = new Map<string, { id: string; label: string }[]>();
    for (const l of levelRows ?? []) {
      const list = levelsByDimension.get(l.dimension_id) ?? [];
      list.push({ id: l.id, label: l.label });
      levelsByDimension.set(l.dimension_id, list);
    }
    dimensions = (dimensionRows ?? []).map((d) => ({ id: d.id, name: d.name, levels: levelsByDimension.get(d.id) ?? [] }));

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
        openBalanceILS: balances.get(c.id) ?? 0,
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
      status: invitationByContact.get(c.id) ?? "לא הוזמן",
    }));
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
      boundCreateDimension={boundCreateDimension}
      boundDeleteDimension={boundDeleteDimension}
      boundAddLevel={boundAddLevel}
      boundDeleteLevel={boundDeleteLevel}
    />
  );
}
