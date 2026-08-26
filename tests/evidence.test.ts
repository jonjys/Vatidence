import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildEvidence, canonicalJson, sealOf, toCsv, toPdf, winAnsi } from "@/lib/evidence";
import type { Order, OrderItem } from "@/lib/types";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    publicToken: "tok_abcdef",
    status: "fulfilled",
    requesterCountry: "SE",
    requesterVat: "556036079301",
    itemCount: 3,
    currency: "eur",
    amountTotal: 490,
    amountRefunded: 0,
    stripeSessionId: "cs_1",
    stripePaymentIntentId: "pi_1",
    stripeChargeId: "ch_1",
    attempts: 1,
    lastError: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    paidAt: new Date("2026-01-01T00:00:10Z"),
    completedAt: new Date("2026-01-01T00:00:30Z"),
    purgeAfter: new Date("2026-04-01T00:00:00Z"),
    purgedAt: null,
    ...overrides,
  };
}

function item(position: number, overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: `i${position}`,
    orderId: "o1",
    position,
    countryCode: "SE",
    vatNumber: `55603607930${position}`,
    status: "valid",
    attempts: 1,
    nextAttemptAt: null,
    lastError: null,
    viesValid: true,
    viesRequestId: `WAPIAAAAX${position}`,
    viesRequestDate: "2026-01-01T00:00:20Z",
    viesName: "ACME AB",
    viesAddress: "Street 1, Stockholm",
    checkedAt: new Date("2026-01-01T00:00:20Z"),
    refunded: false,
    ...overrides,
  };
}

const SAMPLE = [
  item(1),
  item(2, { status: "invalid", viesValid: false, viesRequestId: null, viesName: null, viesAddress: null }),
  item(3, {
    status: "failed_permanent",
    viesValid: null,
    viesRequestId: null,
    viesName: null,
    lastError: "MS_UNAVAILABLE: member state offline",
  }),
];

describe("evidence document", () => {
  it("summarises every row by outcome", () => {
    const doc = buildEvidence(order(), SAMPLE);
    expect(doc).toMatchObject({ rowCount: 3, validCount: 1, invalidCount: 1, unverifiableCount: 1 });
    expect(doc.requesterVat).toBe("SE556036079301");
    expect(doc.rows[0]?.consultationNumber).toBe("WAPIAAAAX1");
    expect(doc.rows[2]?.note).toContain("MS_UNAVAILABLE");
  });

  it("orders rows by position regardless of how they come out of the database", () => {
    const doc = buildEvidence(order(), [SAMPLE[2]!, SAMPLE[0]!, SAMPLE[1]!]);
    expect(doc.rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });
});

describe("integrity seal", () => {
  it("is stable across regenerations, which is the point of calling it evidence", () => {
    const a = sealOf(buildEvidence(order(), SAMPLE));
    const b = sealOf(buildEvidence(order({ completedAt: new Date("2027-06-06T06:06:06Z") }), SAMPLE));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes if any answer changes", () => {
    const base = sealOf(buildEvidence(order(), SAMPLE));
    const tampered = sealOf(buildEvidence(order(), [item(1, { viesRequestId: "DIFFERENT" }), SAMPLE[1]!, SAMPLE[2]!]));
    expect(tampered).not.toBe(base);
  });

  it("serialises deterministically", () => {
    const doc = buildEvidence(order(), SAMPLE);
    expect(canonicalJson(doc)).toBe(canonicalJson(buildEvidence(order(), SAMPLE)));
  });
});

describe("CSV export", () => {
  it("emits a header and one row per VAT number", () => {
    const csv = toCsv(buildEvidence(order(), SAMPLE));
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("vies_consultation_number");
    expect(lines[1]).toContain("SE556036079301");
  });

  it("neutralises spreadsheet formula injection from upstream trader names", () => {
    const csv = toCsv(buildEvidence(order(), [item(1, { viesName: "=cmd|'/c calc'!A1" })]));
    expect(csv).toContain("\"'=cmd|'/c calc'!A1\"");
    expect(csv).not.toContain(',"=cmd');
  });

  it("escapes quotes and flattens newlines that VIES puts in addresses", () => {
    const csv = toCsv(buildEvidence(order(), [item(1, { viesAddress: 'c/o "Group"\nHus 209\nLINKOPING' })]));
    expect(csv).toContain('c/o ""Group"" Hus 209 LINKOPING');
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });

  it("starts with a BOM so Excel reads UTF-8 without an import wizard", () => {
    expect(toCsv(buildEvidence(order(), SAMPLE)).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("PDF export", () => {
  it("produces a real PDF carrying the seal", async () => {
    const doc = buildEvidence(order(), SAMPLE);
    const bytes = await toPdf(doc, new Date("2026-02-02T02:02:02Z"));
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("paginates large orders instead of overflowing one page", async () => {
    const many = Array.from({ length: 120 }, (_, i) => item(i + 1));
    const bytes = await toPdf(buildEvidence(order({ itemCount: 120 }), many), new Date());
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });

  it("survives names the standard PDF fonts cannot encode", async () => {
    const bytes = await toPdf(buildEvidence(order(), [item(1, { viesName: "Ελληνικά" })]), new Date());
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});

describe("winAnsi", () => {
  it("keeps Latin-1 and replaces what it cannot encode", () => {
    expect(winAnsi("Åäö LINKÖPING")).toBe("Åäö LINKÖPING");
    expect(winAnsi("株式会社")).toBe("????");
  });

  it("drops control characters and flattens newlines", () => {
    expect(winAnsi(`a${String.fromCharCode(1)}b`)).toBe("ab");
    expect(winAnsi("a\nb")).toBe("a b");
  });
});
