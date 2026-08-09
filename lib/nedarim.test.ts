import { describe, expect, it } from "vitest";
import {
  NEDARIM_CURRENCY_CODES,
  isNedarimSuccessStatus,
  isNedarimSupportedCurrency,
  nedarimCurrencyToSymbol,
  parseNedarimHistoryDate,
} from "@/lib/nedarim";

describe("isNedarimSupportedCurrency", () => {
  it("supports only ILS and USD, matching Nedarim Plus's documented API", () => {
    expect(isNedarimSupportedCurrency("₪")).toBe(true);
    expect(isNedarimSupportedCurrency("$")).toBe(true);
    expect(Object.keys(NEDARIM_CURRENCY_CODES)).toEqual(["₪", "$"]);
  });

  it("rejects every other app currency (e.g. EUR, GBP, CHF)", () => {
    expect(isNedarimSupportedCurrency("€")).toBe(false);
    expect(isNedarimSupportedCurrency("£")).toBe(false);
    expect(isNedarimSupportedCurrency("CHF")).toBe(false);
  });
});

describe("isNedarimSuccessStatus", () => {
  it("recognizes the documented success statuses", () => {
    expect(isNedarimSuccessStatus("OK")).toBe(true);
    expect(isNedarimSuccessStatus("true")).toBe(true);
    expect(isNedarimSuccessStatus("אישור")).toBe(true);
    expect(isNedarimSuccessStatus("בוצע")).toBe(true);
    expect(isNedarimSuccessStatus("success")).toBe(true);
  });

  it("rejects an explicit failure status", () => {
    expect(isNedarimSuccessStatus("false")).toBe(false);
    expect(isNedarimSuccessStatus("error")).toBe(false);
    expect(isNedarimSuccessStatus("0")).toBe(false);
  });

  it("treats the bare status \"1\" as success (documented, matches Nedarim's status code for approved)", () => {
    expect(isNedarimSuccessStatus("1")).toBe(true);
  });

  // תוקן: התאמה מדויקת (עוגן גם בסוף) במקום prefix בלבד - "1" כבר לא תואם בטעות קוד
  // שגיאה כמו "100". התיעוד הרשמי של נדרים פלוס לא היה נגיש לי לאימות (פורטל דורש
  // התחברות, פורומי קהילה חסמו גישה אוטומטית) - אם בפועל מתגלה ערך הצלחה מורכב
  // שאינו תואם יותר, יש להרחיב את הרשימה במפורש ולא לחזור ל-prefix matching
  it("no longer treats a status merely starting with the digit 1 as success", () => {
    expect(isNedarimSuccessStatus("100")).toBe(false);
    expect(isNedarimSuccessStatus("123-some-error-code")).toBe(false);
  });

  it("still matches the exact success tokens surrounded by incidental whitespace", () => {
    expect(isNedarimSuccessStatus(" OK ")).toBe(true);
    expect(isNedarimSuccessStatus("1")).toBe(true);
  });
});

describe("nedarimCurrencyToSymbol", () => {
  it("maps documented currency codes back to the app's currency symbols", () => {
    expect(nedarimCurrencyToSymbol("1")).toBe("₪");
    expect(nedarimCurrencyToSymbol("2")).toBe("$");
  });

  it("returns null for an undocumented currency code", () => {
    expect(nedarimCurrencyToSymbol("3")).toBeNull();
  });
});

describe("parseNedarimHistoryDate", () => {
  it("parses dd/mm/yyyy (the format documented for request-side date params)", () => {
    expect(parseNedarimHistoryDate("15/03/2026")).toBe("2026-03-15");
  });

  it("parses dd/mm/yyyy with a trailing time component", () => {
    expect(parseNedarimHistoryDate("15/03/2026 14:30:00")).toBe("2026-03-15");
  });

  it("parses an ISO-formatted date", () => {
    expect(parseNedarimHistoryDate("2026-03-15T14:30:00")).toBe("2026-03-15");
  });

  it("returns null instead of guessing for an unrecognized format", () => {
    expect(parseNedarimHistoryDate("March 15, 2026")).toBeNull();
  });

  it("returns null for empty/missing input", () => {
    expect(parseNedarimHistoryDate("")).toBeNull();
    expect(parseNedarimHistoryDate(null)).toBeNull();
    expect(parseNedarimHistoryDate(undefined)).toBeNull();
  });
});
