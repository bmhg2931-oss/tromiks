import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";

let mockAdminClient: ReturnType<typeof createFakeSupabase> | null = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockAdminClient }));
vi.mock("@/app/(app)/campaigns/email-actions", () => ({ sendHtmlEmail: vi.fn() }));

import { GET } from "@/app/api/cron/task-reminders/route";

function makeRequest(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new NextRequest("http://localhost/api/cron/task-reminders", { headers });
}

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  mockAdminClient = createFakeSupabase({
    org_settings: { data: { org_name: "תרומיקס", logo_url: null }, error: null },
    contact_tasks: { data: [], error: null },
  });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("task-reminders cron auth (fail-closed)", () => {
  it("rejects with 401 when CRON_SECRET is not configured at all, even with no auth header sent", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects with 401 when CRON_SECRET is not configured, even if a bearer header happens to be sent", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("Bearer whatever"));
    expect(res.status).toBe(401);
  });

  it("rejects with 401 when CRON_SECRET is configured but the request sends the wrong value", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = await GET(makeRequest("Bearer wrong-value"));
    expect(res.status).toBe(401);
  });

  it("proceeds past the auth gate when the correct bearer secret is sent", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = await GET(makeRequest("Bearer the-real-secret"));
    expect(res.status).toBe(200);
  });
});
