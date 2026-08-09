import { describe, expect, it } from "vitest";
import { guessFieldForHeader, guessFieldFromSamples, matchPaymentMethodSynonym, phoneKey } from "@/lib/donationImportFields";

describe("phoneKey", () => {
  it("takes the last 6 digits, ignoring non-digit characters", () => {
    expect(phoneKey("050-123-4567")).toBe("234567");
  });

  it("matches the same key regardless of country code / leading zero format", () => {
    expect(phoneKey("0501234567")).toBe(phoneKey("+972501234567"));
    expect(phoneKey("0501234567")).toBe(phoneKey("501234567"));
  });

  it("returns fewer than 6 digits (not padded) when the phone has fewer digits", () => {
    expect(phoneKey("12345")).toBe("12345");
  });

  it("returns an empty string for a phone with no digits at all", () => {
    expect(phoneKey("---")).toBe("");
  });
});

describe("guessFieldForHeader", () => {
  it("recognizes exact Hebrew header synonyms", () => {
    expect(guessFieldForHeader("תאריך")).toBe("donation_date");
    expect(guessFieldForHeader("סכום")).toBe("amount");
    expect(guessFieldForHeader("טלפון")).toBe("phone");
    expect(guessFieldForHeader("אמצעי תשלום")).toBe("payment_method_raw");
    expect(guessFieldForHeader("מטבע")).toBe("currency");
    expect(guessFieldForHeader("הערות")).toBe("notes");
  });

  it("falls back to skip for an unrecognized header", () => {
    expect(guessFieldForHeader("עמודה מוזרה שלא קיימת")).toBe("skip");
  });

  it("prefers an exact match over a broader substring match", () => {
    // "שם תורם" צריך להתאים ל-donor_name במדויק ולא "ליפול" על מילה כללית אחרת
    expect(guessFieldForHeader("שם תורם")).toBe("donor_name");
  });
});

describe("guessFieldFromSamples", () => {
  it("recognizes amount-like columns", () => {
    expect(guessFieldFromSamples(["100", "250.5", "1,000"])).toBe("amount");
  });

  it("recognizes date-like columns (DD/MM/YYYY)", () => {
    expect(guessFieldFromSamples(["01/01/2026", "15/03/2026"])).toBe("donation_date");
  });

  it("recognizes phone-like columns", () => {
    expect(guessFieldFromSamples(["0501234567", "0521112222"])).toBe("phone");
  });

  it("returns null when nothing matches confidently", () => {
    expect(guessFieldFromSamples(["שלום", "מה נשמע"])).toBeNull();
  });

  it("returns null for an empty sample set", () => {
    expect(guessFieldFromSamples([])).toBeNull();
  });
});

describe("matchPaymentMethodSynonym", () => {
  it("matches common variants to the exact PAY_METHODS value", () => {
    expect(matchPaymentMethodSynonym("המחאה")).toBe("צ'ק");
    expect(matchPaymentMethodSynonym("אשראי")).toBe("כרטיס אשראי");
    expect(matchPaymentMethodSynonym("cash")).toBe("מזומן");
    expect(matchPaymentMethodSynonym("bit")).toBe("ביט");
  });

  it("returns null for a value with no reasonable match, so AI fallback can be tried", () => {
    expect(matchPaymentMethodSynonym("xyz123 unrecognized")).toBeNull();
  });

  it("returns null for empty/missing input", () => {
    expect(matchPaymentMethodSynonym("")).toBeNull();
    expect(matchPaymentMethodSynonym(null)).toBeNull();
  });
});
