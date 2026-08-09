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

import { fetchAndStageNedarimHistoryPage, getNedarimSyncStatus } from "./nedarim-sync-actions";

const ORIGINAL_ENV = { ...process.env };

function txn(overrides: Record<string, unknown> = {}) {
  return {
    TransactionId: "1001",
    ClientName: "דוד כהן",
    Phone: "0501234567",
    Amount: "180",
    Currency: "1",
    TransactionTime: "01/01/2026",
    Groupe: "כללי",
    Comments: "",
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

beforeEach(() => {
  process.env.NEDARIM_API_PASSWORD = "test-password";
  process.env.NEXT_PUBLIC_NEDARIM_MOSAD = "1234567";
  mockServerClient = createFakeSupabase({ nedarim_sync_state: { data: { last_id: null }, error: null } });
  mockAdminClient = null;
  mockMatchContacts.mockReset();
  mockMatchContacts.mockResolvedValue([]);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("fetchAndStageNedarimHistoryPage", () => {
  it("fails clearly without hitting the network when required env vars are missing", async () => {
    delete process.env.NEDARIM_API_PASSWORD;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchAndStageNedarimHistoryPage({});
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports reachedEnd when Nedarim returns no more transactions, without touching donation_import_rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const result = await fetchAndStageNedarimHistoryPage({});
    expect(result).toMatchObject({ ok: true, fetched: 0, staged: 0, reachedEnd: true });
    expect(mockServerClient!.calls.some((c) => c.table === "donation_import_rows")).toBe(false);
  });

  it("surfaces a non-array response (e.g. an error body sent with HTTP 200, like a bad ApiPassword) as a real error, not as an empty page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ Error: "Invalid ApiPassword" })));
    const result = await fetchAndStageNedarimHistoryPage({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid ApiPassword");
    expect(result.reachedEnd).toBe(false);
  });

  it("stages new transactions as payment_only / כרטיס אשראי, tagged with nedarim_transaction_id", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
      donations: { data: [], error: null },
      donation_import_batches: { data: { id: "batch-1" }, error: null },
      donation_import_rows: { data: [{ id: "row-1" }], error: null },
    });
    mockMatchContacts.mockResolvedValue([{ phone_key: "234567", match_status: "matched", matched_contact_id: "c1", match_source: "auto_suffix" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([txn({ TransactionId: "1001" })])));

    const result = await fetchAndStageNedarimHistoryPage({});

    expect(result).toMatchObject({ ok: true, fetched: 1, staged: 1, skippedDuplicates: 0 });
    const insertCall = mockServerClient.calls.find((c) => c.table === "donation_import_rows" && c.method === "insert");
    const row = (insertCall!.args[0] as Record<string, unknown>[])[0];
    expect(row).toMatchObject({
      record_type: "payment_only",
      payment_method: "כרטיס אשראי",
      nedarim_transaction_id: "1001",
      currency: "₪",
      matched_contact_id: "c1",
    });
  });

  it("silently skips a transaction that already exists on a donation (by nedarim_transaction_id), without re-staging it", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
      donations: { data: [{ nedarim_transaction_id: "1001" }], error: null },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([txn({ TransactionId: "1001" })])));

    const result = await fetchAndStageNedarimHistoryPage({});

    expect(result).toMatchObject({ ok: true, fetched: 1, staged: 0, skippedDuplicates: 1 });
    expect(mockServerClient.calls.some((c) => c.table === "donation_import_batches")).toBe(false);
  });

  it("advances the cursor past a page even when every row in it is filtered out by untilDate", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
      donations: { data: [], error: null },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([txn({ TransactionId: "1001", TransactionTime: "15/03/2026" })])));

    const result = await fetchAndStageNedarimHistoryPage({ untilDate: "2026-01-01" });

    expect(result.staged).toBe(0);
    expect(result.fetched).toBe(1);
    expect(result.lastId).toBe("1001");
    const updateCall = mockServerClient.calls.find((c) => c.table === "nedarim_sync_state" && c.method === "update");
    expect(updateCall!.args[0]).toMatchObject({ last_id: "1001" });
  });

  it("reports pastCutoff once the last transaction in the page is already beyond untilDate, so the client loop knows to stop", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
      donations: { data: [], error: null },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([txn({ TransactionId: "1001", TransactionTime: "15/03/2026" })])));

    const result = await fetchAndStageNedarimHistoryPage({ untilDate: "2026-01-01" });
    expect(result.pastCutoff).toBe(true);
  });

  it("does not report pastCutoff when no untilDate was given at all", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
      donations: { data: [], error: null },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([txn({ TransactionId: "1001", TransactionTime: "15/03/2026" })])));

    const result = await fetchAndStageNedarimHistoryPage({});
    expect(result.pastCutoff).toBe(false);
  });

  it("reports reachedEnd when the page came back shorter than the requested page size", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
      donations: { data: [], error: null },
      donation_import_batches: { data: { id: "batch-1" }, error: null },
      donation_import_rows: { data: [{ id: "row-1" }], error: null },
    });
    mockMatchContacts.mockResolvedValue([{ phone_key: "234567", match_status: "unmatched", matched_contact_id: null, match_source: null }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([txn({ TransactionId: "1001" })])));

    const result = await fetchAndStageNedarimHistoryPage({ maxRows: 200 });
    expect(result.reachedEnd).toBe(true);
  });

  it("returns an error (not a throw) when the HTTP call itself fails, and leaves the cursor untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await fetchAndStageNedarimHistoryPage({});
    expect(result.ok).toBe(false);
    expect(result.lastId).toBeNull();
  });

  it("uses the admin (service-role) client when useServiceRole is set, matching how the cron route calls it", async () => {
    mockAdminClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: null }, error: null },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    await fetchAndStageNedarimHistoryPage({ useServiceRole: true });
    expect(mockAdminClient.calls.length).toBeGreaterThan(0);
  });
});

describe("getNedarimSyncStatus", () => {
  it("reports the current cursor and last update time", async () => {
    mockServerClient = createFakeSupabase({
      nedarim_sync_state: { data: { last_id: "1001", updated_at: "2026-01-01T00:00:00Z" }, error: null },
    });
    const status = await getNedarimSyncStatus();
    expect(status).toEqual({ lastId: "1001", updatedAt: "2026-01-01T00:00:00Z" });
  });
});
