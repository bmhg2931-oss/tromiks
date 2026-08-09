import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFetchAndStage = vi.fn();
vi.mock("@/app/(app)/donations/nedarim-sync-actions", () => ({
  fetchAndStageNedarimHistoryPage: (...args: unknown[]) => mockFetchAndStage(...args),
}));

import { GET } from "@/app/api/cron/nedarim-history-sync/route";

function makeRequest(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new NextRequest("http://localhost/api/cron/nedarim-history-sync", { headers });
}

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  mockFetchAndStage.mockReset();
  mockFetchAndStage.mockResolvedValue({ ok: true, fetched: 0, staged: 0, skippedDuplicates: 0, reachedEnd: true, pastCutoff: false, lastId: null });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("nedarim-history-sync cron auth (fail-closed)", () => {
  it("rejects with 401 when CRON_SECRET is not configured, even with no auth header", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFetchAndStage).not.toHaveBeenCalled();
  });

  it("rejects with 401 when CRON_SECRET is not configured, even with a bearer header sent", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("Bearer whatever"));
    expect(res.status).toBe(401);
    expect(mockFetchAndStage).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the bearer value doesn't match CRON_SECRET", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = await GET(makeRequest("Bearer wrong-value"));
    expect(res.status).toBe(401);
    expect(mockFetchAndStage).not.toHaveBeenCalled();
  });

  it("proceeds to sync (using the service-role client) when the correct bearer secret is sent", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = await GET(makeRequest("Bearer the-real-secret"));
    expect(res.status).toBe(200);
    expect(mockFetchAndStage).toHaveBeenCalledWith({ useServiceRole: true });
  });
});
