import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/exchangeRate", () => ({
  getCurrentExchangeRate: vi.fn(),
  getHistoricalExchangeRate: vi.fn(),
}));

let mockServerClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockServerClient,
}));

import { getCurrentExchangeRate } from "@/lib/exchangeRate";
import {
  createDonationWithClient,
  insertPaymentLines,
  markSurplusAsBonusPledge,
  syncPledgeStatus,
  updateDonation,
} from "@/app/(app)/donations/actions";

const mockedCurrent = vi.mocked(getCurrentExchangeRate);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function withAuth(supabase: ReturnType<typeof createFakeSupabase>, userId: string | null = "user-1") {
  (supabase as unknown as { auth: unknown }).auth = {
    getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
  };
  return supabase;
}

beforeEach(() => {
  mockedCurrent.mockReset();
  mockServerClient = null;
});

describe("createDonationWithClient", () => {
  it("rejects when contact_id is missing", async () => {
    const supabase = createFakeSupabase();
    const result = await createDonationWithClient(supabase as any, "user-1", formData({ amount: "100" }));
    expect(result).toEqual({ ok: false, error: "יש לבחור איש קשר לפי שם או סלולארי" });
    expect(supabase.calls.length).toBe(0);
  });

  it("rejects a zero or negative amount", async () => {
    const supabase = createFakeSupabase();
    const result = await createDonationWithClient(supabase as any, "user-1", formData({ contact_id: "c1", amount: "0" }));
    expect(result.ok).toBe(false);
  });

  it("creates a cash donation with no surplus when the contact isn't in credit", async () => {
    const supabase = createFakeSupabase({
      donations: [
        { data: { id: "donation-1" }, error: null }, // insert
        { data: [], error: null }, // computeSurplus's donations select
      ],
      pledges: { data: [], error: null },
    });
    const result = await createDonationWithClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "80", currency: "₪", payment_method: "מזומן" })
    );
    expect(result).toEqual({ ok: true, donationId: "donation-1", surplus: undefined, surplusCurrency: undefined });
  });

  it("surfaces a surplus (capped at the payment amount) when the payment pushes the contact into credit", async () => {
    // לפני התשלום הזה: התחייבויות 100 ש"ח, ותשלומים (כולל התשלום הזה שכבר נשמר) 150 ש"ח
    // -> נטו -50 ש"ח (זיכוי). התשלום הנוכחי הוא 80 ש"ח בשקלים, אז העודף (50) קטן ממנו
    const supabase = createFakeSupabase({
      donations: [
        { data: { id: "donation-1" }, error: null },
        { data: [{ amount: 150, currency: "₪" }], error: null },
      ],
      pledges: { data: [{ amount: 100, currency: "₪" }], error: null },
    });
    const result = await createDonationWithClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "80", currency: "₪", payment_method: "מזומן" })
    );
    expect(result.ok).toBe(true);
    expect(result.surplus).toBeCloseTo(50);
    expect(result.surplusCurrency).toBe("₪");
  });

  it("caps the surplus at the payment amount itself, never exceeding what was actually paid", async () => {
    const supabase = createFakeSupabase({
      donations: [
        { data: { id: "donation-1" }, error: null },
        { data: [{ amount: 500, currency: "₪" }], error: null },
      ],
      pledges: { data: [{ amount: 100, currency: "₪" }], error: null },
    });
    // נטו הוא -400 ש"ח, אבל התשלום הנוכחי הוא רק 80 - העודף לא יכול להיות גדול מהתשלום עצמו
    const result = await createDonationWithClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "80", currency: "₪", payment_method: "מזומן" })
    );
    expect(result.surplus).toBeCloseTo(80);
  });

  it("marks a credit-card donation as pending until card_transaction_ok confirms it", async () => {
    const supabase = createFakeSupabase({
      donations: [
        { data: { id: "donation-1" }, error: null },
        { data: [], error: null },
      ],
      pledges: { data: [], error: null },
    });
    await createDonationWithClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "80", payment_method: "כרטיס אשראי" })
    );
    const insertCall = supabase.calls.find((c) => c.table === "donations" && c.method === "insert");
    expect((insertCall!.args[0] as { status: string }).status).toBe("ממתין");
  });

  it("marks a credit-card donation as paid once card_transaction_ok=1 is set (webhook confirmation)", async () => {
    const supabase = createFakeSupabase({
      donations: [
        { data: { id: "donation-1" }, error: null },
        { data: [], error: null },
      ],
      pledges: { data: [], error: null },
    });
    await createDonationWithClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "80", payment_method: "כרטיס אשראי", card_transaction_ok: "1" })
    );
    const insertCall = supabase.calls.find((c) => c.table === "donations" && c.method === "insert");
    expect((insertCall!.args[0] as { status: string }).status).toBe("שולם");
  });
});

describe("syncPledgeStatus", () => {
  it("marks a fully-paid pledge as שולם", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: { amount: 100, status: "פתוח" }, error: null },
      donations: { data: [{ amount: 100 }], error: null },
    });
    await syncPledgeStatus(supabase as any, "pledge-1");
    const updateCall = supabase.calls.find((c) => c.table === "pledges" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("שולם");
  });

  it("treats a payment within 0.009 of the pledge amount as fully paid (rounding tolerance)", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: { amount: 100, status: "פתוח" }, error: null },
      donations: { data: [{ amount: 99.991 }], error: null },
    });
    await syncPledgeStatus(supabase as any, "pledge-1");
    const updateCall = supabase.calls.find((c) => c.table === "pledges" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("שולם");
  });

  it("treats a payment more than 0.009 short as only partially paid", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: { amount: 100, status: "פתוח" }, error: null },
      donations: { data: [{ amount: 99.98 }], error: null },
    });
    await syncPledgeStatus(supabase as any, "pledge-1");
    const updateCall = supabase.calls.find((c) => c.table === "pledges" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("שולם חלקית");
  });

  it("marks a pledge with no payments at all as open", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: { amount: 100, status: "פתוח" }, error: null },
      donations: { data: [], error: null },
    });
    await syncPledgeStatus(supabase as any, "pledge-1");
    const updateCall = supabase.calls.find((c) => c.table === "pledges" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("פתוח");
  });

  it("never touches an already-cancelled pledge", async () => {
    const supabase = createFakeSupabase({
      pledges: { data: { amount: 100, status: "בוטל" }, error: null },
    });
    await syncPledgeStatus(supabase as any, "pledge-1");
    expect(supabase.calls.some((c) => c.method === "update")).toBe(false);
    expect(supabase.calls.some((c) => c.table === "donations")).toBe(false);
  });
});

describe("insertPaymentLines", () => {
  it("does nothing when the form has no payment_lines field", async () => {
    const supabase = createFakeSupabase();
    const result = await insertPaymentLines(supabase as any, "donation-1", formData({}));
    expect(result).toBeNull();
    expect(supabase.calls.length).toBe(0);
  });

  it("inserts only lines with a positive amount", async () => {
    const supabase = createFakeSupabase({ donation_payment_lines: { data: null, error: null } });
    const lines = [
      { amount: 100, bankName: "בנק א", branchNumber: "1", accountNumber: "2", checkNumber: "3", checkDate: "2026-01-01" },
      { amount: 0, bankName: "should be dropped", branchNumber: "", accountNumber: "", checkNumber: "", checkDate: "" },
    ];
    const result = await insertPaymentLines(supabase as any, "donation-1", formData({ payment_lines: JSON.stringify(lines) }));
    expect(result).toBeNull();
    const insertCall = supabase.calls.find((c) => c.table === "donation_payment_lines" && c.method === "insert");
    const rows = insertCall!.args[0] as unknown[];
    expect(rows).toHaveLength(1);
    expect((rows[0] as { amount: number }).amount).toBe(100);
  });

  it("silently ignores malformed JSON instead of failing the whole donation save", async () => {
    const supabase = createFakeSupabase();
    const result = await insertPaymentLines(supabase as any, "donation-1", formData({ payment_lines: "{not json" }));
    expect(result).toBeNull();
    expect(supabase.calls.length).toBe(0);
  });
});

describe("markSurplusAsBonusPledge", () => {
  it("rejects a zero or negative amount (previously unvalidated, unlike every sibling action)", async () => {
    const result = await markSurplusAsBonusPledge("c1", "donation-1", 0, "₪", "כללי", "2026-01-01");
    expect(result).toEqual({ ok: false, error: "יש להזין סכום התחייבות תקין" });
  });

  it("creates a matching pledge and links it to the existing donation", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        pledges: { data: { id: "pledge-1" }, error: null },
        donations: [
          { data: { notes: null }, error: null },
          { data: null, error: null },
        ],
      })
    );
    const result = await markSurplusAsBonusPledge("c1", "donation-1", 50, "₪", "כללי", "2026-01-01");
    expect(result).toEqual({ ok: true });
    const linkCall = mockServerClient.calls.find((c) => c.table === "donations" && c.method === "update");
    expect(linkCall!.args[0]).toMatchObject({ pledge_id: "pledge-1", notes: "תרומת בונוס" });
  });
});

describe("updateDonation", () => {
  it("preserves a confirmed card donation's paid status when editing unrelated fields (bug fix)", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donations: [
          { data: { status: "שולם", payment_method: "כרטיס אשראי" }, error: null }, // existing row
          { data: { pledge_id: null }, error: null }, // update result
        ],
      })
    );
    await updateDonation(
      "donation-1",
      null,
      formData({ amount: "100", payment_method: "כרטיס אשראי", contact_id: "c1", purpose: "כללי", notes: "תיקון הערה" })
    );
    const updateCall = mockServerClient.calls.find((c) => c.table === "donations" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("שולם");
  });

  it("keeps an unconfirmed card donation pending", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donations: [
          { data: { status: "ממתין", payment_method: "כרטיס אשראי" }, error: null },
          { data: { pledge_id: null }, error: null },
        ],
      })
    );
    await updateDonation("donation-1", null, formData({ amount: "100", payment_method: "כרטיס אשראי", contact_id: "c1" }));
    const updateCall = mockServerClient.calls.find((c) => c.table === "donations" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("ממתין");
  });

  it("always marks a non-card payment method as paid", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donations: [
          { data: { status: "שולם", payment_method: "מזומן" }, error: null },
          { data: { pledge_id: null }, error: null },
        ],
      })
    );
    await updateDonation("donation-1", null, formData({ amount: "100", payment_method: "מזומן", contact_id: "c1" }));
    const updateCall = mockServerClient.calls.find((c) => c.table === "donations" && c.method === "update");
    expect((updateCall!.args[0] as { status: string }).status).toBe("שולם");
  });
});
