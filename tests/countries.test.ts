import { describe, expect, it } from "vitest";
import { COUNTRIES, COUNTRY_LIST, countryFromInput } from "@/lib/countries";
import { SUPPORTED_COUNTRIES, parseVat } from "@/lib/vat";

describe("country reference table", () => {
  it("covers every member state VIES answers for, once, in order", () => {
    expect(COUNTRY_LIST.map((c) => c.code)).toEqual([...SUPPORTED_COUNTRIES]);
  });

  it.each(COUNTRY_LIST.map((c) => [c.code, c.example] as const))(
    "%s: the published example is accepted by the same parser that bills orders",
    (code, example) => {
      const parsed = parseVat(example);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value.countryCode).toBe(code);
    },
  );

  it("keeps examples obviously made up, so none reads as a real company", () => {
    for (const c of COUNTRY_LIST) {
      expect(c.example.slice(2)).toMatch(/123|^U1234/);
    }
  });

  it("says that Germany never discloses a name or address", () => {
    expect(COUNTRIES.DE.note).toMatch(/validity only/);
  });
});

describe("countryFromInput", () => {
  it("names the country as soon as two letters are typed", () => {
    expect(countryFromInput("D")).toBeNull();
    expect(countryFromInput("de")?.name).toBe("Germany");
    expect(countryFromInput("  nl 123")?.code).toBe("NL");
  });

  it("reads past a pasted label and punctuation", () => {
    expect(countryFromInput("VAT: FR 12 345")?.code).toBe("FR");
  });

  it("maps GR to Greece's VIES code, but never GB to Northern Ireland", () => {
    expect(countryFromInput("GR123")?.code).toBe("EL");
    expect(countryFromInput("GB123456789")).toBeNull();
  });

  it("returns nothing for a prefix VIES does not cover", () => {
    expect(countryFromInput("US123")).toBeNull();
    expect(countryFromInput("12345")).toBeNull();
  });
});
