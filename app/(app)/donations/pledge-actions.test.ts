import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockServerClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockServerClient,
}));

import { createPledgeWithPaymentUsingClient, updatePledgeWithPayment } from "@/app/(app)/donations/pledge-actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createPledgeWithPaymentUsingClient", () => {
  it("rejects when contact_id is missing", async () => {
    const supabase = createFakeSupabase();
    const result = await createPledgeWithPaymentUsingClient(supabase as any, "user-1", formData({ amount: "100" }));
    expect(result.ok).toBe(false);
    expect(supabase.calls.length).toBe(0);
  });

  it("rejects a zero or negative pledge amount", async () => {
    const supabase = createFakeSupabase();
    const result = await createPledgeWithPaymentUsingClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "0", payment_amount: "50" })
    );
    expect(result.ok).toBe(false);
    expect(supabase.calls.length).toBe(0);
  });

  it("rejects a zero or negative payment amount after the pledge itself is valid", async () => {
    const supabase = createFakeSupabase();
    const result = await createPledgeWithPaymentUsingClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "100", payment_amount: "0" })
    );
    expect(result.ok).toBe(false);
    // ההתחייבות עצמה עדיין לא נוצרת אם התשלום לא תקין - בדיקת תקינות התשלום קודמת ליצירה בפועל
    expect(supabase.calls.length).toBe(0);
  });

  it("creates the pledge and its linked payment, then syncs the pledge to שולם when paid in full", async () => {
    const supabase = createFakeSupabase({
      pledges: [
        { data: { id: "pledge-1" }, error: null }, // insert
        { data: { amount: 100, status: "פתוח" }, error: null }, // syncPledgeStatus select
        { data: null, error: null }, // syncPledgeStatus update
      ],
      donations: [
        { data: { id: "donation-1" }, error: null }, // insert
        { data: [{ amount: 100 }], error: null }, // syncPledgeStatus donations select
      ],
    });
    const result = await createPledgeWithPaymentUsingClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "100", payment_amount: "100", currency: "₪" })
    );
    expect(result).toMatchObject({ ok: true, pledgeId: "pledge-1", donationId: "donation-1", contactId: "c1" });
    const syncUpdateCall = supabase.calls.filter((c) => c.table === "pledges" && c.method === "update")[0];
    expect((syncUpdateCall.args[0] as { status: string }).status).toBe("שולם");
  });

  it("links the payment donation to the newly created pledge via pledge_id", async () => {
    const supabase = createFakeSupabase({
      pledges: [
        { data: { id: "pledge-1" }, error: null },
        { data: { amount: 100, status: "פתוח" }, error: null },
        { data: null, error: null },
      ],
      donations: [
        { data: { id: "donation-1" }, error: null },
        { data: [{ amount: 40 }], error: null },
      ],
    });
    await createPledgeWithPaymentUsingClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "100", payment_amount: "40", currency: "₪" })
    );
    const insertCall = supabase.calls.find((c) => c.table === "donations" && c.method === "insert");
    expect((insertCall!.args[0] as { pledge_id: string }).pledge_id).toBe("pledge-1");
    const syncUpdateCall = supabase.calls.filter((c) => c.table === "pledges" && c.method === "update")[0];
    expect((syncUpdateCall.args[0] as { status: string }).status).toBe("שולם חלקית");
  });

  it("keeps a credit-card payment pending until card_transaction_ok confirms it", async () => {
    const supabase = createFakeSupabase({
      pledges: [
        { data: { id: "pledge-1" }, error: null },
        { data: { amount: 100, status: "פתוח" }, error: null },
        { data: null, error: null },
      ],
      donations: [
        { data: { id: "donation-1" }, error: null },
        { data: [], error: null },
      ],
    });
    await createPledgeWithPaymentUsingClient(
      supabase as any,
      "user-1",
      formData({ contact_id: "c1", amount: "100", payment_amount: "100", payment_method: "כרטיס אשראי" })
    );
    const insertCall = supabase.calls.find((c) => c.table === "donations" && c.method === "insert");
    expect((insertCall!.args[0] as { status: string }).status).toBe("ממתין");
  });
});

describe("updatePledgeWithPayment", () => {
  beforeEach(() => {
    mockServerClient = null;
  });

  it("rejects a zero or negative pledge amount", async () => {
    mockServerClient = createFakeSupabase();
    const result = await updatePledgeWithPayment(
      "pledge-1",
      "donation-1",
      null,
      formData({ contact_id: "c1", amount: "0", payment_amount: "50" })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a zero or negative payment amount", async () => {
    mockServerClient = createFakeSupabase();
    const result = await updatePledgeWithPayment(
      "pledge-1",
      "donation-1",
      null,
      formData({ contact_id: "c1", amount: "100", payment_amount: "0" })
    );
    expect(result.ok).toBe(false);
  });

  it("updates both records and re-syncs the pledge status from the new payment total", async () => {
    mockServerClient = createFakeSupabase({
      pledges: [
        { data: null, error: null }, // pledge update
        { data: { amount: 100, status: "שולם חלקית" }, error: null }, // syncPledgeStatus select
        { data: null, error: null }, // syncPledgeStatus update
      ],
      donations: [
        { data: null, error: null }, // donation update
        { data: [{ amount: 100 }], error: null }, // syncPledgeStatus donations select
      ],
    });
    const result = await updatePledgeWithPayment(
      "pledge-1",
      "donation-1",
      null,
      formData({ contact_id: "c1", amount: "100", payment_amount: "100", currency: "₪" })
    );
    expect(result.ok).toBe(true);
    // שתי עדכוני "pledges" קורים כאן: הראשון הוא עדכון שדות ההתחייבות מהטופס (ללא status),
    // השני הוא syncPledgeStatus שמעדכן רק את ה-status על סמך סך התשלומים בפועל
    const pledgeUpdateCalls = mockServerClient.calls.filter((c) => c.table === "pledges" && c.method === "update");
    expect(pledgeUpdateCalls).toHaveLength(2);
    const syncUpdateCall = pledgeUpdateCalls[1];
    expect((syncUpdateCall.args[0] as { status: string }).status).toBe("שולם");
  });
});
