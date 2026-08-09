import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";
import type { Campaign } from "@/lib/types";

vi.mock("@/lib/exchangeRate", () => ({
  getCurrentExchangeRate: vi.fn(),
  getHistoricalExchangeRate: vi.fn(),
}));

import { getCurrentExchangeRate, getHistoricalExchangeRate } from "@/lib/exchangeRate";
import {
  convertILSAmounts,
  getCampaignDirectTotals,
  getFamilyGivingByContact,
  rollupCampaignTotals,
} from "@/lib/campaignBalance";

const mockedCurrent = vi.mocked(getCurrentExchangeRate);
const mockedHistorical = vi.mocked(getHistoricalExchangeRate);

beforeEach(() => {
  mockedCurrent.mockReset();
  mockedHistorical.mockReset();
});

function makeCampaign(overrides: Partial<Campaign> & { id: string }): Campaign {
  return {
    name: overrides.id,
    description: null,
    parent_campaign_id: null,
    goal_amount: null,
    goal_currency: "₪",
    start_date: null,
    end_date: null,
    status: "פעיל",
    enabled_tabs: [],
    included_departments: null,
    audience_mode: "department",
    included_contact_ids: null,
    email_template: null,
    fax_template: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("getCampaignDirectTotals", () => {
  it("only counts rows that are directly tagged to a campaign, converted at their own historical rate", async () => {
    mockedHistorical.mockResolvedValue({ ok: true, rate: 4 });
    const supabase = createFakeSupabase({
      pledges: {
        data: [{ campaign_id: "camp1", amount: 100, currency: "$", pledge_date: "2026-01-01" }],
        error: null,
      },
      donations: {
        data: [{ campaign_id: "camp1", amount: 50, currency: "₪", donation_date: "2026-01-02" }],
        error: null,
      },
    });
    const totals = await getCampaignDirectTotals(supabase as any);
    expect(totals.get("camp1")).toEqual({ pledgedILS: 400, paidILS: 50 });
  });

  it("excludes cancelled pledges and soft-deleted rows via the query filters", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: [], error: null },
      donations: { data: [], error: null },
    });
    await getCampaignDirectTotals(supabase as any);
    expect(supabase.calls).toContainEqual({ table: "pledges", method: "neq", args: ["status", "בוטל"] });
    expect(supabase.calls).toContainEqual({ table: "pledges", method: "is", args: ["deleted_at", null] });
    expect(supabase.calls).toContainEqual({ table: "donations", method: "is", args: ["deleted_at", null] });
  });
});

describe("rollupCampaignTotals", () => {
  it("adds a parent campaign's direct children into its own total", () => {
    const campaigns = [
      makeCampaign({ id: "parent" }),
      makeCampaign({ id: "child1", parent_campaign_id: "parent" }),
      makeCampaign({ id: "child2", parent_campaign_id: "parent" }),
    ];
    const direct = new Map([
      ["parent", { pledgedILS: 100, paidILS: 50 }],
      ["child1", { pledgedILS: 30, paidILS: 10 }],
      ["child2", { pledgedILS: 20, paidILS: 5 }],
    ]);
    const rolled = rollupCampaignTotals(campaigns, direct);
    expect(rolled.get("parent")).toEqual({ pledgedILS: 150, paidILS: 65 });
  });

  it("shows a sub-campaign only its own direct total, never its parent's or siblings'", () => {
    const campaigns = [makeCampaign({ id: "parent" }), makeCampaign({ id: "child", parent_campaign_id: "parent" })];
    const direct = new Map([
      ["parent", { pledgedILS: 100, paidILS: 50 }],
      ["child", { pledgedILS: 30, paidILS: 10 }],
    ]);
    const rolled = rollupCampaignTotals(campaigns, direct);
    expect(rolled.get("child")).toEqual({ pledgedILS: 30, paidILS: 10 });
  });

  it("only rolls up one nesting level — a node with a parent_campaign_id never aggregates its own children", () => {
    // בפועל ה-DB חוסם קינון ל-3 רמות (enforce_campaign_single_level), אך הפונקציה
    // עצמה לא בודקת עומק - היא מחליטה על סמך "יש parent_campaign_id?" בלבד. אם
    // בכל זאת נוצר מבנה תלת-רמתי, "parent" (שיש לו הורה) מציג רק את הסכום הישיר
    // שלו ואף פעם לא את של "grandchild", וגם "grandparent" לא רואה את "grandchild"
    // (כי היא לא ילדה ישירה שלו) - הסכום של grandchild "נבלע" ולא מגיע לאף אחד
    const campaigns = [
      makeCampaign({ id: "grandparent" }),
      makeCampaign({ id: "parent", parent_campaign_id: "grandparent" }),
      makeCampaign({ id: "grandchild", parent_campaign_id: "parent" }),
    ];
    const direct = new Map([
      ["grandparent", { pledgedILS: 0, paidILS: 0 }],
      ["parent", { pledgedILS: 0, paidILS: 0 }],
      ["grandchild", { pledgedILS: 1000, paidILS: 1000 }],
    ]);
    const rolled = rollupCampaignTotals(campaigns, direct);
    expect(rolled.get("grandchild")).toEqual({ pledgedILS: 1000, paidILS: 1000 });
    expect(rolled.get("parent")).toEqual({ pledgedILS: 0, paidILS: 0 });
    expect(rolled.get("grandparent")).toEqual({ pledgedILS: 0, paidILS: 0 });
  });

  it("defaults to zero totals for a campaign with no direct rows at all", () => {
    const campaigns = [makeCampaign({ id: "empty" })];
    const rolled = rollupCampaignTotals(campaigns, new Map());
    expect(rolled.get("empty")).toEqual({ pledgedILS: 0, paidILS: 0 });
  });
});

describe("getFamilyGivingByContact", () => {
  it("returns an empty map without querying when given no campaign ids", async () => {
    const supabase = createFakeSupabase({ donations: { data: [{ contact_id: "should-not-appear" }], error: null } });
    const result = await getFamilyGivingByContact(supabase as any, []);
    expect(result.size).toBe(0);
    expect(supabase.calls.length).toBe(0);
  });

  it("sums each contact's donations to campaigns in the given family, in ILS", async () => {
    const supabase = createFakeSupabase({
      donations: {
        data: [
          { contact_id: "c1", amount: 100, currency: "₪", donation_date: "2026-01-01" },
          { contact_id: "c1", amount: 50, currency: "₪", donation_date: "2026-01-02" },
        ],
        error: null,
      },
    });
    const result = await getFamilyGivingByContact(supabase as any, ["camp1", "camp2"]);
    expect(result.get("c1")).toBe(150);
    expect(supabase.calls).toContainEqual({ table: "donations", method: "in", args: ["campaign_id", ["camp1", "camp2"]] });
  });
});

describe("convertILSAmounts", () => {
  it("passes ILS totals through unchanged for a campaign whose goal currency is ILS", async () => {
    const totals = new Map([["camp1", { pledgedILS: 100, paidILS: 50 }]]);
    const result = await convertILSAmounts(totals, new Map([["camp1", "₪"]]));
    expect(result.get("camp1")).toEqual({ pledged: 100, paid: 50 });
    expect(mockedCurrent).not.toHaveBeenCalled();
  });

  it("converts ILS totals into the campaign's own goal currency at the current rate", async () => {
    mockedCurrent.mockResolvedValue({ ok: true, rate: 4 });
    const totals = new Map([["camp1", { pledgedILS: 400, paidILS: 200 }]]);
    const result = await convertILSAmounts(totals, new Map([["camp1", "$"]]));
    expect(result.get("camp1")).toEqual({ pledged: 100, paid: 50 });
  });

  it("falls back to raw ILS numbers (mislabeled under the target currency) when no rate is available", async () => {
    mockedCurrent.mockResolvedValue({ ok: false, error: "no rate" });
    const totals = new Map([["camp1", { pledgedILS: 400, paidILS: 200 }]]);
    const result = await convertILSAmounts(totals, new Map([["camp1", "$"]]));
    expect(result.get("camp1")).toEqual({ pledged: 400, paid: 200 });
  });
});
