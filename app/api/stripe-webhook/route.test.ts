import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const mockMatchContacts = vi.fn();
vi.mock("@/app/(app)/donations/mapping-actions", () => ({
  matchContactsForRows: (...args: unknown[]) => mockMatchContacts(...args),
}));

const mockConstructEvent = vi.fn();
const mockChargesRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) };
    charges = { retrieve: (...args: unknown[]) => mockChargesRetrieve(...args) };
  },
}));

import { POST } from "./route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(body: string, signature: string | null = "sig_valid") {
  const headers: Record<string, string> = {};
  if (signature) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost/api/stripe-webhook", { method: "POST", headers, body });
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  mockAdminClient = null;
  mockCreateDonation.mockReset();
  mockCreatePledgeWithPayment.mockReset();
  mockMatchContacts.mockReset();
  mockMatchContacts.mockResolvedValue([{ phone_key: null, match_status: "unmatched", matched_contact_id: null, match_source: null }]);
  mockConstructEvent.mockReset();
  mockChargesRetrieve.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("stripe-webhook auth", () => {
  it("rejects with 401 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(401);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the stripe-signature header is missing", async () => {
    const res = await POST(makeRequest("{}", null));
    expect(res.status).toBe(401);
  });

  it("rejects with 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
  });
});

describe("stripe-webhook checkout.session.completed (flow א - Checkout שלנו)", () => {
  it("does nothing for a Checkout Session without our metadata.kind (not created by our own flow)", async () => {
    mockAdminClient = createFakeSupabase();
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: {}, payment_intent: "pi_1" } },
    });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });

  it("creates a donation for a payment_only Checkout Session, passing card_transaction_ok and the payment_intent id", async () => {
    mockAdminClient = createFakeSupabase({ donations: { data: null, error: null } });
    mockCreateDonation.mockResolvedValue({ ok: true, donationId: "donation-1" });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          payment_intent: "pi_1",
          metadata: { kind: "payment_only", created_by: "user-1", contact_id: "c1", amount: "180" },
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockCreatePledgeWithPayment).not.toHaveBeenCalled();
    expect(mockCreateDonation).toHaveBeenCalledWith(mockAdminClient, "user-1", expect.any(FormData));
    const fd = mockCreateDonation.mock.calls[0][2] as FormData;
    expect(fd.get("card_transaction_ok")).toBe("1");
    expect(fd.get("stripe_payment_intent_id")).toBe("pi_1");
    expect(fd.get("contact_id")).toBe("c1");
    expect(fd.get("kind")).toBeNull();
  });

  it("creates a pledge+payment for a pledge_and_payment Checkout Session", async () => {
    mockAdminClient = createFakeSupabase({ donations: { data: null, error: null } });
    mockCreatePledgeWithPayment.mockResolvedValue({ ok: true, pledgeId: "pledge-1", donationId: "donation-1" });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_intent: "pi_2", metadata: { kind: "pledge_and_payment", contact_id: "c1" } } },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockCreateDonation).not.toHaveBeenCalled();
    expect(mockCreatePledgeWithPayment).toHaveBeenCalled();
  });

  it("is idempotent: does not re-create a donation when one already exists for this payment_intent (duplicate webhook delivery)", async () => {
    mockAdminClient = createFakeSupabase({ donations: { data: { id: "donation-existing" }, error: null } });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_intent: "pi_1", metadata: { kind: "payment_only", contact_id: "c1" } } },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });
});

describe("stripe-webhook payment_intent.succeeded (flow ב - staging)", () => {
  it("stages a payment intent with no matching donation and no existing staged row into donation_import_rows with source='Stripe'", async () => {
    mockAdminClient = createFakeSupabase({
      donations: { data: null, error: null },
      donation_import_rows: [
        { data: null, error: null }, // existing row check
        { data: [{ id: "row-1" }], error: null }, // insert result
      ],
      donation_import_batches: { data: { id: "batch-1" }, error: null },
    });
    mockConstructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_external",
          amount: 5000,
          currency: "usd",
          created: 1770000000,
          latest_charge: "ch_1",
        },
      },
    });
    mockChargesRetrieve.mockResolvedValue({ billing_details: { name: "יעל לוי", phone: "0521234567" } });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    const insertCall = mockAdminClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "insert");
    expect(insertCall).toBeDefined();
    const row = insertCall!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ stripe_payment_intent_id: "pi_external", currency: "$", amount: 50, donor_name: "יעל לוי" });
    const batchCall = mockAdminClient.calls.find((c) => c.table === "donation_import_batches" && c.method === "insert");
    expect((batchCall!.args[0] as Record<string, unknown>).source).toBe("Stripe");
  });

  it("does not stage a payment intent that already became a donation (e.g. via our own Checkout flow)", async () => {
    mockAdminClient = createFakeSupabase({ donations: { data: { id: "donation-1" }, error: null } });
    mockConstructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", amount: 1000, currency: "ils", created: 1770000000 } },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAdminClient.calls.some((c) => c.table === "donation_import_rows" && c.method === "insert")).toBe(false);
  });

  it("does not re-stage a payment intent that was already staged by a previous webhook delivery", async () => {
    mockAdminClient = createFakeSupabase({
      donations: { data: null, error: null },
      donation_import_rows: { data: { id: "row-already-staged" }, error: null },
    });
    mockConstructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", amount: 1000, currency: "ils", created: 1770000000 } },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAdminClient.calls.some((c) => c.table === "donation_import_batches")).toBe(false);
  });
});
