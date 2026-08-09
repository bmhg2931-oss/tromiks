import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("@/lib/exchangeRate", () => ({
  getCurrentExchangeRate: vi.fn(),
  getHistoricalExchangeRate: vi.fn(),
}));

import { getCurrentExchangeRate, getHistoricalExchangeRate } from "@/lib/exchangeRate";
import { convertBalanceMap, formatOpenBalance, getContactBalances, getContactTotalPledges } from "@/lib/pledgeBalance";

const mockedCurrent = vi.mocked(getCurrentExchangeRate);
const mockedHistorical = vi.mocked(getHistoricalExchangeRate);

beforeEach(() => {
  mockedCurrent.mockReset();
  mockedHistorical.mockReset();
});

describe("getContactBalances", () => {
  it("nets pledges minus donations per contact, converting each row at its OWN historical rate (not today's rate)", async () => {
    mockedHistorical.mockImplementation(async (currency, date) => {
      if (currency === "$" && date === "2026-01-02") return { ok: true, rate: 3.5 };
      return { ok: false, error: "no rate" };
    });

    const supabase = createFakeSupabase({
      pledges: {
        data: [
          { contact_id: "c1", amount: 100, currency: "₪", pledge_date: "2026-01-01" },
          { contact_id: "c1", amount: 50, currency: "$", pledge_date: "2026-01-02" },
        ],
        error: null,
      },
      donations: {
        data: [{ contact_id: "c1", amount: 30, currency: "₪", donation_date: "2026-01-03" }],
        error: null,
      },
    });

    const balances = await getContactBalances(supabase as any);
    // (100 + 50*3.5) - 30 = 245
    expect(balances.get("c1")).toBeCloseTo(245);
  });

  it("only queries non-cancelled, non-deleted pledges and non-deleted donations", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: [], error: null },
      donations: { data: [], error: null },
    });
    await getContactBalances(supabase as any);
    expect(supabase.calls).toContainEqual({ table: "pledges", method: "neq", args: ["status", "בוטל"] });
    expect(supabase.calls).toContainEqual({ table: "pledges", method: "is", args: ["deleted_at", null] });
    expect(supabase.calls).toContainEqual({ table: "donations", method: "is", args: ["deleted_at", null] });
  });
});

describe("getContactTotalPledges", () => {
  it("sums pledges without subtracting donations", async () => {
    const supabase = createFakeSupabase({
      pledges: {
        data: [{ contact_id: "c1", amount: 200, currency: "₪", pledge_date: "2026-01-01" }],
        error: null,
      },
    });
    const totals = await getContactTotalPledges(supabase as any);
    expect(totals.get("c1")).toBe(200);
  });
});

describe("convertBalanceMap", () => {
  it("returns the ILS map unchanged when the display currency is already ILS", async () => {
    const balances = new Map([["c1", 100]]);
    const result = await convertBalanceMap(balances, "₪");
    expect(result).toBe(balances);
    expect(mockedCurrent).not.toHaveBeenCalled();
  });

  it("divides every balance by the current rate for a foreign display currency", async () => {
    mockedCurrent.mockResolvedValue({ ok: true, rate: 4 });
    const balances = new Map([["c1", 400]]);
    const result = await convertBalanceMap(balances, "$");
    expect(result.get("c1")).toBe(100);
  });

  it("falls back to the raw ILS numbers (mislabeled under the target currency) when no rate is available", async () => {
    mockedCurrent.mockResolvedValue({ ok: false, error: "no rate" });
    const balances = new Map([["c1", 400]]);
    const result = await convertBalanceMap(balances, "$");
    expect(result).toBe(balances);
  });
});

describe("formatOpenBalance", () => {
  it("formats a positive balance above the 0.5 threshold", () => {
    expect(formatOpenBalance(1500, "₪")).toBe("₪1,500");
  });

  it("hides balances at or below the 0.5 threshold (rounding noise) as em-dash", () => {
    expect(formatOpenBalance(0.5)).toBe("—");
    expect(formatOpenBalance(0.49)).toBe("—");
  });

  it("hides negative balances (credit) as em-dash — this column only shows open debt", () => {
    expect(formatOpenBalance(-50)).toBe("—");
  });

  it("shows a value just above the threshold", () => {
    expect(formatOpenBalance(0.51)).toBe("₪1");
  });
});
