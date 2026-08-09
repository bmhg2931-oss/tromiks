import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

let mockAdminClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockAdminClient }));

const mockCreateDonation = vi.fn();
const mockCreatePledgeWithPayment = vi.fn();
vi.mock("@/app/(app)/donations/actions", () => ({ createDonationWithClient: (...args: unknown[]) => mockCreateDonation(...args) }));
vi.mock("@/app/(app)/donations/pledge-actions", () => ({
  createPledgeWithPaymentUsingClient: (...args: unknown[]) => mockCreatePledgeWithPayment(...args),
}));

import { POST } from "@/app/api/nedarim-callback/route";

const VALID_IP = "18.194.219.73";

function makeRequest(ip: string | null, body: unknown) {
  const headers: Record<string, string> = {};
  if (ip) headers["x-forwarded-for"] = ip;
  return new NextRequest("http://localhost/api/nedarim-callback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAdminClient = null;
  mockCreateDonation.mockReset();
  mockCreatePledgeWithPayment.mockReset();
});

describe("nedarim-callback IP allowlist", () => {
  it("rejects a request with no x-forwarded-for header", async () => {
    const res = await POST(makeRequest(null, { Param1: "charge-1" }));
    expect(res.status).toBe(403);
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });

  it("rejects a request from an IP outside Nedarim's documented callback list", async () => {
    const res = await POST(makeRequest("1.2.3.4", { Param1: "charge-1" }));
    expect(res.status).toBe(403);
  });
});

describe("nedarim-callback idempotency", () => {
  it("no-ops (ok:true) for an unrecognized charge id, without creating anything", async () => {
    mockAdminClient = createFakeSupabase({ nedarim_pending_charges: { data: null, error: null } });
    const res = await POST(makeRequest(VALID_IP, { Param1: "unknown-charge", Status: "OK" }));
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });

  it("no-ops (ok:true) for a charge that was already confirmed, without reprocessing it", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: { data: { id: "charge-1", status: "confirmed" }, error: null },
    });
    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Status: "OK" }));
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });

  it("no-ops (ok:true) for a charge that was already marked failed, without reprocessing it", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: { data: { id: "charge-1", status: "failed" }, error: null },
    });
    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Status: "OK" }));
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });
});

describe("nedarim-callback amount reconciliation", () => {
  it("marks the charge failed when the reported amount differs from the expected amount by more than 0.5", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: [
        { data: { id: "charge-1", status: "pending", expected_amount: 100, flow: "payment_only", payload: {} }, error: null },
        { data: null, error: null },
      ],
    });
    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Amount: 150, Status: "OK" }));
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockCreateDonation).not.toHaveBeenCalled();
    const updateCall = mockAdminClient.calls.find((c) => c.table === "nedarim_pending_charges" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ status: "failed", error_message: "אי-התאמה בסכום העסקה" });
  });

  it("tolerates a small rounding difference (<=0.5) between reported and expected amount", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: [
        { data: { id: "charge-1", status: "pending", expected_amount: 100, flow: "payment_only", payload: {} }, error: null },
        { data: null, error: null },
      ],
    });
    mockCreateDonation.mockResolvedValue({ ok: true, donationId: "donation-1" });
    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Amount: 100.3, Status: "OK" }));
    await res.json();
    expect(mockCreateDonation).toHaveBeenCalled();
  });
});

describe("nedarim-callback status handling", () => {
  it("marks the charge failed when Nedarim reports a non-success status", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: [
        { data: { id: "charge-1", status: "pending", expected_amount: 100, flow: "payment_only", payload: {} }, error: null },
        { data: null, error: null },
      ],
    });
    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Amount: 100, Status: "declined", Message: "כרטיס נדחה" }));
    await res.json();
    expect(mockCreateDonation).not.toHaveBeenCalled();
    const updateCall = mockAdminClient.calls.find((c) => c.table === "nedarim_pending_charges" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ status: "failed", error_message: "כרטיס נדחה" });
  });
});

describe("nedarim-callback creation flows", () => {
  it("creates a straight donation for a payment_only charge and marks it confirmed", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: [
        {
          data: { id: "charge-1", status: "pending", expected_amount: 100, flow: "payment_only", payload: { amount: "100" }, created_by: "user-1" },
          error: null,
        },
        { data: null, error: null },
      ],
    });
    mockCreateDonation.mockResolvedValue({ ok: true, donationId: "donation-1", surplus: 5, surplusCurrency: "₪" });

    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Amount: 100, Status: "OK", ID: "txn-1" }));
    await res.json();

    expect(mockCreatePledgeWithPayment).not.toHaveBeenCalled();
    expect(mockCreateDonation).toHaveBeenCalledWith(mockAdminClient, "user-1", expect.any(FormData));
    const updateCall = mockAdminClient.calls.find((c) => c.table === "nedarim_pending_charges" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({
      status: "confirmed",
      result_donation_id: "donation-1",
      result_surplus: 5,
      result_surplus_currency: "₪",
      nedarim_transaction_id: "txn-1",
    });
  });

  it("creates a pledge+payment for a non payment_only charge and marks it confirmed", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: [
        {
          data: { id: "charge-1", status: "pending", expected_amount: 100, flow: "pledge_and_payment", payload: {}, created_by: null },
          error: null,
        },
        { data: null, error: null },
      ],
    });
    mockCreatePledgeWithPayment.mockResolvedValue({ ok: true, pledgeId: "pledge-1", donationId: "donation-1" });

    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Amount: 100, Status: "OK" }));
    await res.json();

    expect(mockCreateDonation).not.toHaveBeenCalled();
    expect(mockCreatePledgeWithPayment).toHaveBeenCalled();
    const updateCall = mockAdminClient.calls.find((c) => c.table === "nedarim_pending_charges" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ status: "confirmed", result_pledge_id: "pledge-1", result_donation_id: "donation-1" });
  });

  it("marks the charge failed (not confirmed) when the creation logic itself fails", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_pending_charges: [
        { data: { id: "charge-1", status: "pending", expected_amount: 100, flow: "payment_only", payload: {} }, error: null },
        { data: null, error: null },
      ],
    });
    mockCreateDonation.mockResolvedValue({ ok: false, error: "שגיאת מסד נתונים" });

    const res = await POST(makeRequest(VALID_IP, { Param1: "charge-1", Amount: 100, Status: "OK" }));
    await res.json();

    const updateCall = mockAdminClient.calls.find((c) => c.table === "nedarim_pending_charges" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ status: "failed", error_message: "שגיאת מסד נתונים" });
  });
});
