import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STANDARD_RATE_BP,
  analyseExposure,
  countryFromLocale,
  detectColumns,
  detectDelimiter,
  formatMoney,
  parseAmountMinor,
  parseCsv,
  readHandoff,
  toTable,
  vatAt,
} from "@/lib/exposure";
import { SUPPORTED_COUNTRIES } from "@/lib/vat";

const STRIPE_LIKE = [
  "id,Customer Name,Customer Tax ID,Amount Due,Amount Paid,Currency,Tax",
  'in_1,"Acme GmbH",DE811907980,0.00,"1,200.00",eur,0.00',
  "in_2,Bolt SAS,FR40303265045,0.00,450.50,eur,0.00",
  "in_3,Acme GmbH,DE 811 907 980,0.00,300.00,eur,0.00",
  "in_4,Jane Doe,,0.00,49.00,eur,9.80",
  "in_5,Typo AB,SE12345,0.00,800.00,eur,0.00",
].join("\n");

describe("CSV reading", () => {
  it("detects the delimiter outside quotes", () => {
    expect(detectDelimiter('a;b;"c,d,e"\n1;2;3')).toBe(";");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a,b")).toBe(",");
  });

  it("handles quotes, doubled quotes, embedded newlines, CRLF, a BOM and blank lines", () => {
    const rows = parseCsv('﻿name,note\r\n"Acme, Inc","said ""hi""\nthen left"\r\n\r\nB,x\r\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Acme, Inc", 'said "hi"\nthen left'],
      ["B", "x"],
    ]);
  });
});

describe("amounts", () => {
  it.each([
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1 234,56", 123456],
    ["€120", 12000],
    ["120.00 EUR", 12000],
    ["(45.00)", -4500],
    ["-45", -4500],
    ["12,5", 1250],
    ["1,234", 123400],
    ["0.1", 10],
    ["1'234.50", 123450],
  ])("%s → %i", (raw, minor) => {
    expect(parseAmountMinor(raw)).toBe(minor);
  });

  it("refuses text rather than counting it as zero", () => {
    expect(parseAmountMinor("")).toBeNull();
    expect(parseAmountMinor("n/a")).toBeNull();
    expect(parseAmountMinor("2026-10-11")).toBeNull();
  });
});

describe("column detection", () => {
  it("finds the VAT, paid amount and currency columns in a Stripe-style export", () => {
    const table = toTable(parseCsv(STRIPE_LIKE));
    expect(table.hasHeader).toBe(true);
    const cols = detectColumns(table);
    expect(table.header[cols.vat!]).toBe("Customer Tax ID");
    expect(table.header[cols.amount!]).toBe("Amount Paid");
    expect(table.header[cols.currency!]).toBe("Currency");
  });

  it("reads a headerless file as data", () => {
    const table = toTable(parseCsv("DE811907980;1.200,00\nFR40303265045;450,50"));
    expect(table.hasHeader).toBe(false);
    expect(table.rows).toHaveLength(2);
    const cols = detectColumns(table);
    expect(cols.vat).toBe(0);
    expect(cols.amount).toBe(1);
    expect(cols.currency).toBeNull();
  });

  it("prefers a column named for VAT over another column that happens to parse", () => {
    const table = toTable(parseCsv("Reference,Momsnummer\nDE811907980,DE811907980\nX1,FR40303265045"));
    expect(detectColumns(table).vat).toBe(1);
  });
});

describe("the exposure report", () => {
  const table = toTable(parseCsv(STRIPE_LIKE));
  const report = analyseExposure(table, detectColumns(table));

  it("deduplicates numbers across rows and sums what was sold against each", () => {
    expect(report.dataRows).toBe(5);
    expect(report.numbers.map((n) => n.canonical)).toEqual(["DE811907980", "FR40303265045"]);
    expect(report.numbers[0]).toMatchObject({ rows: 2, amount: { EUR: 150000 } });
  });

  it("separates malformed numbers, which cannot be evidenced at all", () => {
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0]).toMatchObject({ input: "SE12345", rows: 1, amount: { EUR: 80000 } });
    expect(report.totalInvalid).toEqual({ EUR: 80000 });
  });

  it("counts rows without a VAT number but leaves them out of the totals", () => {
    expect(report.rowsWithoutVat).toBe(1);
    expect(report.totalWithVat).toEqual({ EUR: 150000 + 45050 + 80000 });
  });

  it("prices the exposure at a chosen rate, per currency", () => {
    expect(vatAt({ EUR: 100000, SEK: 50000 }, 2500)).toEqual({ EUR: 25000, SEK: 12500 });
    expect(formatMoney(vatAt(report.totalWithVat, STANDARD_RATE_BP.DE))).toBe("€523");
  });

  it("uses the fallback currency when the file has none, so totals are never unitless", () => {
    const bare = toTable(parseCsv("vat;amount\nDE811907980;1 200,00\nFR40303265045;300,50"));
    const r = analyseExposure(bare, detectColumns(bare), "SEK");
    expect(r.totalWithVat).toEqual({ SEK: 150050 });
    expect(formatMoney(vatAt(r.totalWithVat, 2500))).toMatch(/SEK/);
  });

  it("works without an amount column", () => {
    const bare = toTable(parseCsv("vat\nDE811907980\nDE811907980\nbad1"));
    const r = analyseExposure(bare, detectColumns(bare));
    expect(r.numbers).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
  });
});

describe("rates and defaults", () => {
  it("has a standard rate for every VIES member state", () => {
    for (const code of SUPPORTED_COUNTRIES) expect(STANDARD_RATE_BP[code]).toBeGreaterThan(1000);
  });

  it("reads the default member state from the browser locale", () => {
    expect(countryFromLocale("sv-SE")).toBe("SE");
    expect(countryFromLocale("el-GR")).toBe("EL");
    expect(countryFromLocale("en-US")).toBe("DE");
    expect(countryFromLocale(undefined)).toBe("DE");
  });
});

describe("hand-off to the order form", () => {
  it("passes well-formed numbers and nothing else", () => {
    expect(readHandoff(JSON.stringify(["DE811907980", "junk", 7]))).toEqual(["DE811907980"]);
    expect(readHandoff("not json")).toEqual([]);
    expect(readHandoff(null)).toEqual([]);
  });

  it("is read by the order form and never sends the file anywhere", () => {
    const form = readFileSync("src/components/order-form.tsx", "utf8");
    expect(form).toContain("HANDOFF_KEY");
    expect(form).toContain("readHandoff");
    const scan = readFileSync("src/components/exposure-scan.tsx", "utf8");
    expect(scan).not.toMatch(/fetch\(/);
  });
});
