import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentExchangeRate, getHistoricalExchangeRate } from "@/lib/exchangeRate";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function textResponse(body: string, ok = true) {
  return { ok, text: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCurrentExchangeRate", () => {
  it("rejects an unsupported currency symbol without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await getCurrentExchangeRate("XYZ");
    expect(result).toEqual({ ok: false, error: "מטבע לא נתמך" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the rate as-is when the API reports no unit scaling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ currentExchangeRate: 3.65, lastUpdate: "2026-08-09" }))
    );
    const result = await getCurrentExchangeRate("$");
    expect(result).toEqual({ ok: true, rate: 3.65, asOf: "2026-08-09" });
  });

  it("divides by the API-reported unit (e.g. rate quoted per 100 units)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ currentExchangeRate: 250, unit: 100, lastUpdate: "2026-08-09" }))
    );
    const result = await getCurrentExchangeRate("JPY");
    expect(result.ok).toBe(true);
    expect(result.rate).toBeCloseTo(2.5);
  });

  it("returns an error when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const result = await getCurrentExchangeRate("$");
    expect(result.ok).toBe(false);
  });

  it("returns an error when the payload shape is unexpected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ currentExchangeRate: "not-a-number" })));
    const result = await getCurrentExchangeRate("$");
    expect(result.ok).toBe(false);
  });

  it("returns an error instead of throwing when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await getCurrentExchangeRate("$");
    expect(result).toEqual({ ok: false, error: "לא ניתן היה להתחבר לשירות שערי המטבע" });
  });
});

describe("getHistoricalExchangeRate", () => {
  it("rejects an unsupported currency symbol without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await getHistoricalExchangeRate("XYZ", "2026-08-09");
    expect(result).toEqual({ ok: false, error: "מטבע לא נתמך" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses the last CSV row as the observed rate for a plain currency", async () => {
    const csv = "TIME_PERIOD,OBS_VALUE\n2026-08-06,3.60\n2026-08-07,3.65\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(csv)));
    const result = await getHistoricalExchangeRate("$", "2026-08-09");
    expect(result).toEqual({ ok: true, rate: 3.65, asOf: "2026-08-07" });
  });

  it("applies the JPY unit override (quoted per 100 units)", async () => {
    const csv = "TIME_PERIOD,OBS_VALUE\n2026-08-07,250\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(csv)));
    const result = await getHistoricalExchangeRate("JPY", "2026-08-09");
    expect(result.ok).toBe(true);
    expect(result.rate).toBeCloseTo(2.5);
  });

  it("applies the LBP unit override (quoted per 10 units)", async () => {
    const csv = "TIME_PERIOD,OBS_VALUE\n2026-08-07,4\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(csv)));
    const result = await getHistoricalExchangeRate("LBP", "2026-08-09");
    expect(result.ok).toBe(true);
    expect(result.rate).toBeCloseTo(0.4);
  });

  it("returns an error when no observation is found for the window (weekend/holiday gap beyond 7 days)", async () => {
    const csv = "TIME_PERIOD,OBS_VALUE\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(csv)));
    const result = await getHistoricalExchangeRate("$", "2026-08-09");
    expect(result).toEqual({ ok: false, error: "לא נמצא שער יציג לתאריך זה" });
  });

  it("returns an error when the observed value is zero or not a number", async () => {
    const csv = "TIME_PERIOD,OBS_VALUE\n2026-08-07,0\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(csv)));
    const result = await getHistoricalExchangeRate("$", "2026-08-09");
    expect(result.ok).toBe(false);
  });

  it("returns an error when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse("", false)));
    const result = await getHistoricalExchangeRate("$", "2026-08-09");
    expect(result.ok).toBe(false);
  });

  it("returns an error instead of throwing when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await getHistoricalExchangeRate("$", "2026-08-09");
    expect(result).toEqual({ ok: false, error: "לא ניתן היה להתחבר לשירות שערי המטבע" });
  });
});
