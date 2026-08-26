import { describe, expect, it } from "vitest";
import { SUPPORTED_COUNTRIES, parseVat, parseVatList } from "@/lib/vat";

describe("parseVat", () => {
  it("accepts real numbers in the formats customers actually paste", () => {
    for (const input of ["SE556036079301", "se 556036079301", "SE 556036079301 ", "VAT: SE-556036079301"]) {
      const r = parseVat(input);
      expect(r.ok, input).toBe(true);
      if (r.ok) expect(r.value.canonical).toBe("SE556036079301");
    }
  });

  it("covers every VIES member state with a pattern", () => {
    for (const country of SUPPORTED_COUNTRIES) {
      expect(parseVat(`${country}`).ok).toBe(false); // prefix alone is never valid
    }
    const samples = ["ATU12345678", "BE0123456789", "DE811907980", "FR40303265045", "IT00743110157", "NL123456789B01", "PL1234567890", "XI123456789"];
    for (const s of samples) expect(parseVat(s).ok, s).toBe(true);
  });

  it("maps the country codes people type to the ones VIES uses", () => {
    const gr = parseVat("GR123456789");
    expect(gr.ok).toBe(true);
    if (gr.ok) expect(gr.value.countryCode).toBe("EL");
  });

  it("rejects Great Britain with a reason a human can act on", () => {
    const r = parseVat("GB123456789");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Brexit|Northern Ireland/);
  });

  it("rejects malformed input rather than charging for it", () => {
    for (const input of ["", "   ", "123456789", "US123456789", "SE", "SE12345", "DE81190798012345", "SE55603607930X"]) {
      expect(parseVat(input).ok, input).toBe(false);
    }
  });

  it("rejects absurdly long input before it reaches the database", () => {
    expect(parseVat("SE" + "1".repeat(500)).ok).toBe(false);
  });
});

describe("parseVatList", () => {
  it("splits on every separator a spreadsheet export might use", () => {
    const r = parseVatList("SE556036079301\nFR40303265045,IT00743110157;DE811907980\tPL1234567890", 100);
    expect(r.items.map((i) => i.canonical)).toEqual([
      "SE556036079301",
      "FR40303265045",
      "IT00743110157",
      "DE811907980",
      "PL1234567890",
    ]);
  });

  it("removes duplicates so nobody is billed twice for the same number", () => {
    const r = parseVatList("SE556036079301\nse-556036079301\nSE 556036079301", 100);
    expect(r.items).toHaveLength(1);
    expect(r.duplicates).toHaveLength(2);
  });

  it("separates unusable rows instead of failing the whole list", () => {
    const r = parseVatList("SE556036079301\nnot-a-vat-number\nFR40303265045", 100);
    expect(r.items).toHaveLength(2);
    expect(r.rejected).toHaveLength(1);
  });

  it("enforces the row limit", () => {
    const input = Array.from({ length: 30 }, (_, i) => `SE${String(556036079301 + i)}`).join("\n");
    const r = parseVatList(input, 10);
    expect(r.items).toHaveLength(10);
    expect(r.rejected.length).toBe(20);
  });
});
