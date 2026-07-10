"use client";

import { useState } from "react";
import Link from "next/link";
import { CAMPAIGN_TAB_OPTIONS, type Campaign } from "@/lib/types";
import TabBar from "./TabBar";
import CampaignProgressBar from "./CampaignProgressBar";
import NewCampaignModal from "./NewCampaignModal";
import CampaignSettingsModal from "./CampaignSettingsModal";
import CampaignRecordsTable, { type CampaignRecordRow } from "./CampaignRecordsTable";
import { type DimensionWithLevels } from "./CampaignDimensionsManager";
import CampaignMappingTable, { type MappingContactRow } from "./CampaignMappingTable";
import CampaignInvitationTable, { type InvitationContactRow } from "./CampaignInvitationTable";
import CampaignFundraisingWorkspace, { type FundraisingContactRow } from "./CampaignFundraisingWorkspace";
import type { PickerContact } from "./CampaignAudiencePickerModal";

type NamedItem = { id: string; name: string };
type ChildCampaign = { id: string; name: string; goal_amount: number | null; goal_currency: string; raised: number };
type MappingActionFn = (arg1: string, arg2?: string) => Promise<{ ok: boolean; error?: string }>;

export default function CampaignTabsView({
  campaign,
  editable,
  parent,
  children,
  raised,
  records,
  dimensions,
  mappingContacts,
  invitationContacts,
  fundraisingContacts,
  categories,
  handlers,
  defaultHub,
  defaultCurrency,
  campaignCategoryName,
  otherCampaignsForImport,
  allContacts,
  boundCreateDimension,
  boundDeleteDimension,
  boundAddLevel,
  boundDeleteLevel,
}: {
  campaign: Campaign;
  editable: boolean;
  parent: { id: string; name: string } | null;
  children: ChildCampaign[];
  raised: number;
  records: CampaignRecordRow[];
  dimensions: DimensionWithLevels[];
  mappingContacts: MappingContactRow[];
  invitationContacts: InvitationContactRow[];
  fundraisingContacts: FundraisingContactRow[];
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
  campaignCategoryName?: string | null;
  otherCampaignsForImport: NamedItem[];
  allContacts: PickerContact[];
  boundCreateDimension: (name: string) => Promise<{ ok: boolean; error?: string }>;
  boundDeleteDimension: MappingActionFn;
  boundAddLevel: (dimensionId: string, label: string) => Promise<{ ok: boolean; error?: string }>;
  boundDeleteLevel: MappingActionFn;
}) {
  const tabs = CAMPAIGN_TAB_OPTIONS.filter((t) => campaign.enabled_tabs.includes(t) && (editable || t === "התרמה"));
  const [tab, setTab] = useState<string>(tabs[0] ?? "התרמה");

  return (
    <div>
      {parent && (
        <Link href={`/campaigns/${parent.id}`} className="text-sm text-brass-deep hover:underline mb-2 inline-block">
          ← {parent.name}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-serif text-3xl font-bold">{campaign.name}</h1>
        {editable && (
          <CampaignSettingsModal
            campaignId={campaign.id}
            initialAudienceMode={campaign.audience_mode}
            initialDepartments={campaign.included_departments ?? []}
            initialContactIds={campaign.included_contact_ids ?? []}
            allContacts={allContacts}
            otherCampaigns={otherCampaignsForImport}
            dimensions={dimensions}
            initialEmailTemplate={campaign.email_template ?? ""}
            initialFaxTemplate={campaign.fax_template ?? ""}
            boundCreateDimension={boundCreateDimension}
            boundDeleteDimension={boundDeleteDimension}
            boundAddLevel={boundAddLevel}
            boundDeleteLevel={boundDeleteLevel}
          />
        )}
      </div>
      {campaign.description && <p className="text-sm text-ink-soft mb-4">{campaign.description}</p>}

      {tabs.length > 1 && <TabBar tabs={tabs.map((t) => ({ key: t, label: t }))} active={tab} onChange={setTab} />}

      {tab === "התרמה" && (
        <div>
          <div className="bg-white border border-line rounded-xl shadow p-5 mb-6">
            <CampaignProgressBar raised={raised} goal={campaign.goal_amount} currency={campaign.goal_currency} />
            {!parent && children.length > 0 && <p className="text-xs text-ink-soft mt-2">כולל את כל תתי-הקמפיינים המפורטים למטה</p>}
          </div>

          {!parent && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-lg font-bold">תתי-קמפיינים</h2>
                {editable && <NewCampaignModal label="תת-קמפיין חדש" parentCampaignId={campaign.id} parentName={campaign.name} />}
              </div>
              {children.length === 0 ? (
                <p className="text-sm text-ink-soft mb-6">אין עדיין תתי-קמפיינים.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/campaigns/${child.id}`}
                      className="bg-white border border-line rounded-xl shadow p-4 hover:bg-parchment/30 hover:border-brass/50 transition"
                    >
                      <h3 className="font-semibold mb-2">{child.name}</h3>
                      <CampaignProgressBar raised={child.raised} goal={child.goal_amount} currency={child.goal_currency} />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          <h2 className="font-serif text-lg font-bold mb-3">מרכז ההתרמה</h2>
          <CampaignFundraisingWorkspace
            campaignId={campaign.id}
            campaignName={campaign.name}
            contacts={fundraisingContacts}
            records={records}
            categories={categories}
            handlers={handlers}
            defaultHub={defaultHub}
            defaultCurrency={defaultCurrency}
            campaignCategoryName={campaignCategoryName}
            editable={editable}
            emailTemplate={campaign.email_template}
            faxTemplate={campaign.fax_template}
          />
        </div>
      )}

      {tab === "מיפוי" && (
        <CampaignMappingTable
          campaignId={campaign.id}
          campaignName={campaign.name}
          contacts={mappingContacts}
          dimensions={dimensions}
          records={records}
          categories={categories}
          handlers={handlers}
          defaultHub={defaultHub}
          defaultCurrency={defaultCurrency}
          campaignCategoryName={campaignCategoryName}
          editable={editable}
          emailTemplate={campaign.email_template}
          faxTemplate={campaign.fax_template}
        />
      )}

      {tab === "הזמנה" && (
        <CampaignInvitationTable campaignId={campaign.id} campaignName={campaign.name} contacts={invitationContacts} />
      )}

      {tab === "התחייבויות ותשלומים" && (
        <div>
          <h2 className="font-serif text-lg font-bold mb-3">התחייבויות ותשלומים</h2>
          <CampaignRecordsTable rows={records} />
        </div>
      )}
    </div>
  );
}
