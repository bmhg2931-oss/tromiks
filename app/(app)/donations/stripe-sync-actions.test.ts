import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

let mockServerClient: ReturnType<typeof createFakeSupabase> | null = null;
let mockAdminClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mockServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockAdminClient }));

const mockMatchContacts = vi.fn();
vi.mock("@/app/(app)/donations/mapping-actions", () => ({
  matchContactsForRows: (...args: unknown[]) => mockMatchContacts(...args),
}));

const mockPaymentIntentsList = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { list: (...args: unknown[]) => mockPaymentIntentsList(...args) };
  },
}));

import { fetchAndStageStripeHistoryPage, getStripeSyncStatus } from "./stripe-sync-actions";

const ORIGINAL_ENV = { ...process.env };

function paymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_1001",
    status: "succeeded",
    amount: 18000,
    currency: "ils",
    created: 1770000000,
    latest_charge: { billing_details: { name: "דוד כהן", phone: "0501234567" } },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  mockServerClient = createFakeSupabase({ stripe_sync_state: { data: { last_payment_intent_id: null }, error: null } });
  mockAdminClient = null;
  mockMatchContacts.mockReset();
  mockMatchContacts.mockResolvedValue([]);
  mockPaymentIntentsList.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("fetchAndStageStripeHistoryPage", () => {
  it("fails clearly without hitting Stripe when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const result = await fetchAndStageStripeHistoryPage({});
    expect(result.ok).toBe(false);
    expect(mockPaymentIntentsList).not.toHaveBeenCalled();
  });

  it("reports reachedEnd when Stripe returns no more payment intents, without touching donation_import_rows", async () => {
    mockPaymentIntentsList.mockResolvedValue({ data: [], has_more: false });
    const result = await fetchAndStageStripeHistoryPage({});
    expect(result).toMatchObject({ ok: true, fetched: 0, staged: 0, reachedEnd: true });
    expect(mockServerClient!.calls.some((c) => c.table === "donation_import_rows")).toBe(false);
  });

  it("stages new succeeded payment intents as payment_only / כרטיס אשראי, tagged with stripe_payment_intent_id", async () => {
    mockServerClient = createFakeSupabase({
      stripe_sync_state: { data: { last_payment_intent_id: null }, error: null },
      donations: { data: [], error: null },
      donation_import_batches: { data: { id: "batch-1" }, error: null },
      donation_import_rows: { data: [{ id: "row-1" }], error: null },
    });
    mockMatchContacts.mockResolvedValue([{ phone_key: "234567", match_status: "matched", matched_contact_id: "c1", match_source: "auto_suffix" }]);
    mockPaymentIntentsList.mockResolvedValue({ data: [paymentIntent()], has_more: false });

    const result = await fetchAndStageStripeHistoryPage({});

    expect(result).toMatchObject({ ok: true, fetched: 1, staged: 1, skippedDuplicates: 0, reachedEnd: true });
    const insertCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "insert");
    const row = (insertCall!.args[0] as Record<string, unknown>[])[0];
    expect(row).toMatchObject({
      record_type: "payment_only",
      payment_method: "כרטיס אשראי",
      stripe_payment_intent_id: "pi_1001",
      currency: "₪",
      amount: 180,
      donor_name: "דוד כהן",
      phone: "0501234567",
      matched_contact_id: "c1",
    });
  });

  it("silently skips a payment intent that already exists on a donation (by stripe_payment_intent_id), without re-staging it", async () => {
    mockServerClient = createFakeSupabase({
      stripe_sync_state: { data: { last_payment_intent_id: null }, error: null },
      donations: { data: [{ stripe_payment_intent_id: "pi_1001" }], error: null },
    });
    mockPaymentIntentsList.mockResolvedValue({ data: [paymentIntent()], has_more: false });

    const result = await fetchAndStageStripeHistoryPage({});

    expect(result).toMatchObject({ ok: true, fetched: 1, staged: 0, skippedDuplicates: 1 });
    expect(mockServerClient.calls.some((c) => c.table === "donation_import_batches")).toBe(false);
  });

  it("filters out non-succeeded payment intents (e.g. still processing) without staging them, but still advances the cursor", async () => {
    mockServerClient = createFakeSupabase({
      stripe_sync_state: { data: { last_payment_intent_id: null }, error: null },
      donations: { data: [], error: null },
    });
    mockPaymentIntentsList.mockResolvedValue({ data: [paymentIntent({ id: "pi_pending", status: "processing" })], has_more: false });

    const result = await fetchAndStageStripeHistoryPage({});

    expect(result.staged).toBe(0);
    expect(result.fetched).toBe(1);
    expect(result.lastId).toBe("pi_pending");
    const updateCall = mockServerClient.calls.find((c) => c.table === "stripe_sync_state" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ last_payment_intent_id: "pi_pending" });
  });

  it("passes a real created.lte date filter to Stripe when untilDate is given (no pastCutoff workaround needed)", async () => {
    mockPaymentIntentsList.mockResolvedValue({ data: [], has_more: false });
    await fetchAndStageStripeHistoryPage({ untilDate: "2026-01-01" });
    const callArgs = mockPaymentIntentsList.mock.calls[0][0];
    expect(callArgs.created).toEqual({ lte: expect.any(Number) });
  });

  it("reports reachedEnd based on Stripe's has_more flag", async () => {
    mockServerClient = createFakeSupabase({
      stripe_sync_state: { data: { last_payment_intent_id: null }, error: null },
      donations: { data: [], error: null },
      donation_import_batches: { data: { id: "batch-1" }, error: null },
      donation_import_rows: { data: [{ id: "row-1" }], error: null },
    });
    mockMatchContacts.mockResolvedValue([{ phone_key: null, match_status: "unmatched", matched_contact_id: null, match_source: null }]);
    mockPaymentIntentsList.mockResolvedValue({ data: [paymentIntent()], has_more: true });

    const result = await fetchAndStageStripeHistoryPage({});
    expect(result.reachedEnd).toBe(false);
  });

  it("returns an error (not a throw) when the Stripe API call itself fails, and leaves the cursor untouched", async () => {
    mockPaymentIntentsList.mockRejectedValue(new Error("Invalid API key"));
    const result = await fetchAndStageStripeHistoryPage({});
    expect(result.ok).toBe(false);
    expect(result.lastId).toBeNull();
  });

  it("uses the admin (service-role) client when useServiceRole is set, matching how the cron route calls it", async () => {
    mockAdminClient = createFakeSupabase({ stripe_sync_state: { data: { last_payment_intent_id: null }, error: null } });
    mockPaymentIntentsList.mockResolvedValue({ data: [], has_more: false });
    await fetchAndStageStripeHistoryPage({ useServiceRole: true });
    expect(mockAdminClient.calls.length).toBeGreaterThan(0);
  });
});

describe("getStripeSyncStatus", () => {
  it("reports the current cursor and last update time", async () => {
    mockServerClient = createFakeSupabase({
      stripe_sync_state: { data: { last_payment_intent_id: "pi_1001", updated_at: "2026-01-01T00:00:00Z" }, error: null },
    });
    const status = await getStripeSyncStatus();
    expect(status).toEqual({ lastId: "pi_1001", updatedAt: "2026-01-01T00:00:00Z" });
  });
});
