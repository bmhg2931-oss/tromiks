import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

let mockServerClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mockServerClient }));

const mockCheckoutSessionsCreate = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: {
        create: (...args: unknown[]) => mockCheckoutSessionsCreate(...args),
        retrieve: (...args: unknown[]) => mockCheckoutSessionsRetrieve(...args),
      },
    };
  },
}));

import { createStripeCheckoutSession, getStripeCheckoutStatus } from "./stripe-actions";

function withAuth(supabase: ReturnType<typeof createFakeSupabase>, userId: string | null = "user-1") {
  (supabase as unknown as { auth: unknown }).auth = { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) };
  return supabase;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  mockCheckoutSessionsCreate.mockReset();
  mockCheckoutSessionsRetrieve.mockReset();
  mockServerClient = withAuth(createFakeSupabase());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createStripeCheckoutSession", () => {
  it("rejects an unsupported currency without calling Stripe", async () => {
    const result = await createStripeCheckoutSession("payment_only", { contact_id: "c1" }, 100, "JPY");
    expect(result.ok).toBe(false);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount without calling Stripe", async () => {
    const result = await createStripeCheckoutSession("payment_only", { contact_id: "c1" }, 0, "₪");
    expect(result.ok).toBe(false);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing contact_id without calling Stripe", async () => {
    const result = await createStripeCheckoutSession("payment_only", {}, 100, "₪");
    expect(result.ok).toBe(false);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("builds a Checkout Session with the amount converted to agorot and metadata carrying the form fields + kind + created_by", async () => {
    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-1" });
    const fields = { contact_id: "c1", amount: "180", purpose: "כללי" };
    const result = await createStripeCheckoutSession("payment_only", fields, 180, "₪");

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session-1" });
    const callArgs = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(callArgs.mode).toBe("payment");
    expect(callArgs.line_items[0].price_data.currency).toBe("ils");
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(18000);
    expect(callArgs.metadata).toMatchObject({ kind: "payment_only", created_by: "user-1", contact_id: "c1", amount: "180" });
  });

  it("returns an error (not a throw) when Stripe itself rejects the request", async () => {
    mockCheckoutSessionsCreate.mockRejectedValue(new Error("Invalid API key"));
    const result = await createStripeCheckoutSession("payment_only", { contact_id: "c1" }, 100, "₪");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid API key");
  });
});

describe("getStripeCheckoutStatus", () => {
  it("reports pending while the session hasn't been paid yet", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({ status: "open", payment_status: "unpaid" });
    const result = await getStripeCheckoutStatus("sess-1");
    expect(result).toEqual({ status: "pending" });
  });

  it("reports failed when the session expired", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid" });
    const result = await getStripeCheckoutStatus("sess-1");
    expect(result.status).toBe("failed");
  });

  it("reports confirmed once a donation row exists with the matching payment_intent id", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({ status: "complete", payment_status: "paid", payment_intent: "pi_1" });
    mockServerClient = withAuth(createFakeSupabase({ donations: { data: { id: "donation-1", pledge_id: null, contact_id: "c1" }, error: null } }));
    const result = await getStripeCheckoutStatus("sess-1");
    expect(result).toEqual({ status: "confirmed", donationId: "donation-1", pledgeId: undefined, contactId: "c1" });
  });

  it("reports pending when Stripe confirms payment but the webhook hasn't created the donation yet", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({ status: "complete", payment_status: "paid", payment_intent: "pi_1" });
    mockServerClient = withAuth(createFakeSupabase({ donations: { data: null, error: null } }));
    const result = await getStripeCheckoutStatus("sess-1");
    expect(result).toEqual({ status: "pending" });
  });

  it("reports not_found when Stripe itself doesn't recognize the session id", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(new Error("No such checkout session"));
    const result = await getStripeCheckoutStatus("bad-id");
    expect(result).toEqual({ status: "not_found" });
  });
});
