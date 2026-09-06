import { describe, expect, it } from "vitest";
import { EXAMPLE_VAT_NUMBERS, assertExampleVatNumbers, exampleVatListText } from "@/lib/demo-vats";
import { parseVatList } from "@/lib/vat";

describe("example VAT list", () => {
  it("is fifteen unique, billable numbers", () => {
    expect(EXAMPLE_VAT_NUMBERS).toHaveLength(15);
    expect(new Set(EXAMPLE_VAT_NUMBERS).size).toBe(15);
    assertExampleVatNumbers();
  });

  it("parses as a complete list with nothing rejected", () => {
    const parsed = parseVatList(exampleVatListText(), 100);
    expect(parsed.items).toHaveLength(15);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.duplicates).toEqual([]);
  });
});
