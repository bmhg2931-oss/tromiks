import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockServerClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockServerClient,
}));

const mockCreateDonation = vi.fn();
const mockCreatePledge = vi.fn();
const mockCreatePledgeWithPayment = vi.fn();
vi.mock("@/app/(app)/donations/actions", () => ({ createDonation: (...args: unknown[]) => mockCreateDonation(...args) }));
vi.mock("@/app/(app)/donations/pledge-actions", () => ({
  createPledge: (...args: unknown[]) => mockCreatePledge(...args),
  createPledgeWithPayment: (...args: unknown[]) => mockCreatePledgeWithPayment(...args),
}));

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) };
  },
}));

import {
  commitImportRows,
  matchContactsForRows,
  matchPaymentMethods,
  setRowMatch,
  type ParsedDonationRow,
} from "./mapping-actions";

function withAuth(supabase: ReturnType<typeof createFakeSupabase>, userId: string | null = "user-1") {
  (supabase as unknown as { auth: unknown }).auth = { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) };
  return supabase;
}

function makeRow(overrides: Partial<ParsedDonationRow> = {}): ParsedDonationRow {
  return {
    raw: {},
    donor_name: "דוד כהן",
    phone: "0501234567",
    amount: 100,
    currency: "₪",
    donation_date: "2026-01-01",
    payment_method_raw: "מזומן",
    record_type: "payment_only",
    category: null,
    payment_hub: null,
    pledge_type: null,
    handler: null,
    status: null,
    bank_name: null,
    branch_number: null,
    account_number: null,
    check_number: null,
    check_date: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockServerClient = null;
  mockCreateDonation.mockReset();
  mockCreatePledge.mockReset();
  mockCreatePledgeWithPayment.mockReset();
  mockAnthropicCreate.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("matchContactsForRows", () => {
  it("auto-matches by the last 6 phone digits when exactly one contact shares the suffix", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [], error: null },
      contacts: { data: [{ id: "c1", first_name: "דוד", last_name: "כהן", phone: "0501234567" }], error: null },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: "972501234567" })]);
    expect(match).toEqual({ phone_key: "234567", match_status: "matched", matched_contact_id: "c1", match_source: "auto_suffix" });
  });

  it("marks ambiguous when two different contacts share the same 6-digit suffix", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [], error: null },
      contacts: {
        data: [
          { id: "c1", first_name: "דוד", last_name: "כהן", phone: "0501234567" },
          { id: "c2", first_name: "משה", last_name: "לוי", phone: "0521234567" },
        ],
        error: null,
      },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: "0501234567" })]);
    expect(match.match_status).toBe("ambiguous");
    expect(match.matched_contact_id).toBeNull();
  });

  it("trusts an existing permanent rule when the donor name is missing", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [{ phone_key: "234567", contact_id: "c1" }], error: null },
      contacts: { data: [{ id: "c1", first_name: "דוד", last_name: "כהן", phone: "0501234567" }], error: null },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: "0501234567", donor_name: null })]);
    expect(match).toMatchObject({ match_status: "matched", matched_contact_id: "c1", match_source: "permanent_rule" });
  });

  it("safety net: downgrades to ambiguous when a permanent rule exists but the donor name doesn't match at all", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [{ phone_key: "234567", contact_id: "c1" }], error: null },
      contacts: { data: [{ id: "c1", first_name: "דוד", last_name: "כהן", phone: "0501234567" }], error: null },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: "0501234567", donor_name: "יעקב רוזנברג" })]);
    expect(match.match_status).toBe("ambiguous");
    expect(match.matched_contact_id).toBeNull();
  });

  it("applies a permanent rule when the donor name plausibly overlaps", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [{ phone_key: "234567", contact_id: "c1" }], error: null },
      contacts: { data: [{ id: "c1", first_name: "דוד", last_name: "כהן", phone: "0501234567" }], error: null },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: "0501234567", donor_name: "כהן, דוד" })]);
    expect(match).toMatchObject({ match_status: "matched", matched_contact_id: "c1", match_source: "permanent_rule" });
  });

  it("returns unmatched with no phone_key when the row has no phone at all", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [], error: null },
      contacts: { data: [], error: null },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: null })]);
    expect(match).toEqual({ phone_key: null, match_status: "unmatched", matched_contact_id: null, match_source: null });
  });

  it("returns unmatched when no contact shares the phone suffix", async () => {
    mockServerClient = createFakeSupabase({
      donation_phone_mapping_rules: { data: [], error: null },
      contacts: { data: [{ id: "c1", first_name: "דוד", last_name: "כהן", phone: "0509999999" }], error: null },
    });
    const [match] = await matchContactsForRows([makeRow({ phone: "0501234567" })]);
    expect(match).toEqual({ phone_key: "234567", match_status: "unmatched", matched_contact_id: null, match_source: null });
  });
});

describe("matchPaymentMethods", () => {
  it("resolves synonym-matched values without calling AI at all", async () => {
    const result = await matchPaymentMethods(["המחאה", "מזומן"]);
    expect(result).toEqual({ "המחאה": "צ'ק", "מזומן": "מזומן" });
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("leaves unresolved values as null when no API key is configured", async () => {
    const result = await matchPaymentMethods(["תשלום מוזר לא ידוע"]);
    expect(result["תשלום מוזר לא ידוע"]).toBeNull();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("calls AI exactly once for the whole batch of unresolved values, not per-row", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"וריאציה מוזרה 1": "מזומן", "וריאציה מוזרה 2": null}' }],
    });
    const result = await matchPaymentMethods(["וריאציה מוזרה 1", "וריאציה מוזרה 2", "וריאציה מוזרה 1"]);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(result["וריאציה מוזרה 1"]).toBe("מזומן");
    expect(result["וריאציה מוזרה 2"]).toBeNull();
  });

  it("ignores an AI-guessed value that isn't actually in the closed PAY_METHODS list", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: "text", text: '{"ערך מוזר": "לא קיים ברשימה"}' }] });
    const result = await matchPaymentMethods(["ערך מוזר"]);
    expect(result["ערך מוזר"]).toBeNull();
  });

  it("falls back to null for all unresolved values if the AI call throws", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAnthropicCreate.mockRejectedValue(new Error("network error"));
    const result = await matchPaymentMethods(["ערך בעייתי"]);
    expect(result["ערך בעייתי"]).toBeNull();
  });
});

describe("setRowMatch", () => {
  it("creates a permanent rule and marks match_source accordingly", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donation_import_rows: [{ data: { phone_key: "234567" }, error: null }, { data: null, error: null }],
        donation_phone_mapping_rules: { data: null, error: null },
      })
    );
    const result = await setRowMatch("row-1", "c1", { permanent: true });
    expect(result.ok).toBe(true);
    const upsertCall = mockServerClient.calls.find((c) => c.table === "donation_phone_mapping_rules" && c.method === "upsert");
    expect(upsertCall).toBeTruthy();
    const updateCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "update");
    expect((updateCall!.args[0] as { match_source: string }).match_source).toBe("permanent_rule");
  });

  it("marks match_source as manual when there was no prior rule for this phone_key", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donation_import_rows: [{ data: { phone_key: "234567" }, error: null }, { data: null, error: null }],
        donation_phone_mapping_rules: { data: null, error: null }, // maybeSingle: no existing rule
      })
    );
    const result = await setRowMatch("row-1", "c1", { permanent: false });
    expect(result.ok).toBe(true);
    const updateCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "update");
    expect((updateCall!.args[0] as { match_source: string }).match_source).toBe("manual");
  });

  it("marks match_source as one_time_override when a permanent rule already existed and this pick differs", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donation_import_rows: [{ data: { phone_key: "234567" }, error: null }, { data: null, error: null }],
        donation_phone_mapping_rules: { data: { id: "rule-1" }, error: null }, // maybeSingle: rule exists
      })
    );
    const result = await setRowMatch("row-1", "c2", { permanent: false });
    expect(result.ok).toBe(true);
    const updateCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "update");
    expect((updateCall!.args[0] as { match_source: string }).match_source).toBe("one_time_override");
  });

  it("saves a permanent rule by stripe_customer_id (in addition to phone) for a Stripe row with no phone at all", async () => {
    mockServerClient = withAuth(
      createFakeSupabase({
        donation_import_rows: [{ data: { phone_key: null, stripe_customer_id: "cus_1" }, error: null }, { data: null, error: null }],
        donation_stripe_customer_mapping_rules: { data: null, error: null },
      })
    );
    const result = await setRowMatch("row-1", "c1", { permanent: true });
    expect(result.ok).toBe(true);
    const upsertCall = mockServerClient.calls.find((c) => c.table === "donation_stripe_customer_mapping_rules" && c.method === "upsert");
    expect(upsertCall).toBeTruthy();
    expect(upsertCall!.args[0]).toMatchObject({ stripe_customer_id: "cus_1", contact_id: "c1" });
    const updateCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "update");
    expect((updateCall!.args[0] as { match_source: string }).match_source).toBe("permanent_rule");
  });
});

describe("commitImportRows", () => {
  it("creates a plain donation for a payment_only row, tagged with source='ייבוא קובץ'", async () => {
    mockServerClient = createFakeSupabase({
      donation_import_rows: [
        {
          data: [
            {
              id: "row-1",
              match_status: "matched",
              matched_contact_id: "c1",
              record_type: "payment_only",
              amount: 100,
              currency: "₪",
              donation_date: "2026-01-01",
              payment_method: "מזומן",
              notes: null,
            },
          ],
          error: null,
        },
        { data: null, error: null },
      ],
    });
    mockCreateDonation.mockResolvedValue({ ok: true, donationId: "donation-1" });

    const result = await commitImportRows(["row-1"]);

    expect(result.succeeded).toEqual(["row-1"]);
    expect(mockCreatePledge).not.toHaveBeenCalled();
    expect(mockCreatePledgeWithPayment).not.toHaveBeenCalled();
    const [, formData] = mockCreateDonation.mock.calls[0];
    expect((formData as FormData).get("source")).toBe("ייבוא קובץ");
    expect((formData as FormData).get("contact_id")).toBe("c1");

    const updateCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ match_status: "imported", created_donation_id: "donation-1" });
  });

  it("creates only a pledge for a pledge row, with no linked payment", async () => {
    mockServerClient = createFakeSupabase({
      donation_import_rows: [
        {
          data: [
            {
              id: "row-1",
              match_status: "matched",
              matched_contact_id: "c1",
              record_type: "pledge",
              amount: 500,
              currency: "₪",
              donation_date: "2026-01-01",
              payment_method: null,
              notes: "התחייבות מאירוע",
            },
          ],
          error: null,
        },
        { data: null, error: null },
      ],
    });
    mockCreatePledge.mockResolvedValue({ ok: true, pledgeId: "pledge-1" });

    const result = await commitImportRows(["row-1"]);

    expect(result.succeeded).toEqual(["row-1"]);
    expect(mockCreateDonation).not.toHaveBeenCalled();
    expect(mockCreatePledgeWithPayment).not.toHaveBeenCalled();
    const updateCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ match_status: "imported", created_pledge_id: "pledge-1", created_donation_id: null });
  });

  it("creates a pledge+payment for pledge_and_payment, using the same amount for both", async () => {
    mockServerClient = createFakeSupabase({
      donation_import_rows: [
        {
          data: [
            {
              id: "row-1",
              match_status: "matched",
              matched_contact_id: "c1",
              record_type: "pledge_and_payment",
              amount: 300,
              currency: "₪",
              donation_date: "2026-01-01",
              payment_method: "מזומן",
              notes: null,
            },
          ],
          error: null,
        },
        { data: null, error: null },
      ],
    });
    mockCreatePledgeWithPayment.mockResolvedValue({ ok: true, pledgeId: "pledge-1", donationId: "donation-1" });

    await commitImportRows(["row-1"]);

    const [, formData] = mockCreatePledgeWithPayment.mock.calls[0];
    expect((formData as FormData).get("amount")).toBe("300");
    expect((formData as FormData).get("payment_amount")).toBe("300");
    expect((formData as FormData).get("source")).toBe("ייבוא קובץ");
  });

  it("isolates a failure to one row: earlier and later rows in the same batch still succeed", async () => {
    mockServerClient = createFakeSupabase({
      donation_import_rows: [
        {
          data: [
            { id: "row-1", match_status: "matched", matched_contact_id: "c1", record_type: "payment_only", amount: 100, currency: "₪", donation_date: "2026-01-01", payment_method: "מזומן", notes: null },
            { id: "row-2", match_status: "matched", matched_contact_id: "c2", record_type: "payment_only", amount: 200, currency: "₪", donation_date: "2026-01-01", payment_method: "מזומן", notes: null },
            { id: "row-3", match_status: "matched", matched_contact_id: "c3", record_type: "payment_only", amount: 300, currency: "₪", donation_date: "2026-01-01", payment_method: "מזומן", notes: null },
          ],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    mockCreateDonation
      .mockResolvedValueOnce({ ok: true, donationId: "donation-1" })
      .mockResolvedValueOnce({ ok: false, error: "הפרת אילוץ במסד הנתונים" })
      .mockResolvedValueOnce({ ok: true, donationId: "donation-3" });

    const result = await commitImportRows(["row-1", "row-2", "row-3"]);

    expect(result.succeeded).toEqual(["row-1", "row-3"]);
    expect(result.failed).toEqual([{ rowId: "row-2", error: "הפרת אילוץ במסד הנתונים" }]);
  });

  it("rejects a row that was never matched to a contact, without calling any create function", async () => {
    mockServerClient = createFakeSupabase({
      donation_import_rows: {
        data: [{ id: "row-1", match_status: "ambiguous", matched_contact_id: null, record_type: "payment_only" }],
        error: null,
      },
    });

    const result = await commitImportRows(["row-1"]);

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([{ rowId: "row-1", error: "השורה טרם שויכה לאיש קשר" }]);
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });

  it("silently skips a row that was already imported, without re-committing or counting it as a failure", async () => {
    mockServerClient = createFakeSupabase({
      donation_import_rows: {
        data: [{ id: "row-1", match_status: "imported", matched_contact_id: "c1", record_type: "payment_only", created_donation_id: "donation-1" }],
        error: null,
      },
    });

    const result = await commitImportRows(["row-1"]);

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });
});
