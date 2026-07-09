import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canEditCampaigns, canSeeCampaigns, type Campaign, type UserRole } from "@/lib/types";
import { getCampaignDirectTotals, rollupCampaignTotals, convertILSAmounts } from "@/lib/campaignBalance";
import CampaignProgressBar from "@/components/CampaignProgressBar";
import NewCampaignModal from "@/components/NewCampaignModal";

export default async function CampaignsPage() {
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

  const { data: allCampaigns } = await supabase
    .from("campaigns")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const campaigns = (allCampaigns ?? []) as Campaign[];
  const topLevel = campaigns.filter((c) => !c.parent_campaign_id);

  const direct = await getCampaignDirectTotals(supabase);
  const rolled = rollupCampaignTotals(campaigns, direct);
  const currencyByCampaign = new Map(campaigns.map((c) => [c.id, c.goal_currency]));
  const converted = await convertILSAmounts(rolled, currencyByCampaign);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif text-3xl font-bold">קמפיינים</h1>
        {editable && <NewCampaignModal />}
      </div>

      {topLevel.length === 0 ? (
        <div className="text-center text-ink-soft py-10 bg-white border border-line rounded-xl">אין עדיין קמפיינים במערכת</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topLevel.map((c) => {
            const subCount = campaigns.filter((x) => x.parent_campaign_id === c.id).length;
            const totals = converted.get(c.id) ?? { paid: 0 };
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="bg-white border border-line rounded-xl shadow p-5 hover:bg-parchment/30 hover:border-brass/50 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h2 className="font-serif text-lg font-bold">{c.name}</h2>
                  <span
                    className={`pill whitespace-nowrap ${
                      c.status === "פעיל" ? "pill-active" : c.status === "הושלם" ? "bg-[#e3e6f2] text-[#3a4a8f]" : "pill-inactive"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <CampaignProgressBar raised={totals.paid} goal={c.goal_amount} currency={c.goal_currency} />
                {subCount > 0 && <p className="text-xs text-ink-soft mt-3">{subCount} תת-קמפיינים</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
