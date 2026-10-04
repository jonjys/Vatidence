import { describe, expect, it } from "vitest";
import { toCsv, toPdf } from "@/lib/evidence";
import { SAMPLE_EVIDENCE, SAMPLE_GENERATED_AT } from "@/lib/sample-evidence";
import { parseVat } from "@/lib/vat";

describe("sample evidence pack", () => {
  it("is labelled as a sample wherever someone could mistake it for evidence", () => {
    expect(SAMPLE_EVIDENCE.orderReference).toMatch(/SAMPLE/);
    for (const row of SAMPLE_EVIDENCE.rows) {
      if (row.traderName) expect(row.traderName).toMatch(/SAMPLE/);
      if (row.consultationNumber) expect(row.consultationNumber).toMatch(/SAMPLE|5a3e/);
    }
  });

  it("uses only made-up numbers that still pass the real parser", () => {
    for (const row of SAMPLE_EVIDENCE.rows) {
      expect(parseVat(row.vatNumber).ok, row.vatNumber).toBe(true);
      expect(row.vatNumber.slice(2)).toMatch(/123/);
    }
  });

  it("keeps its counts consistent with its rows", () => {
    const { rows } = SAMPLE_EVIDENCE;
    expect(SAMPLE_EVIDENCE.rowCount).toBe(rows.length);
    expect(SAMPLE_EVIDENCE.validCount + SAMPLE_EVIDENCE.invalidCount + SAMPLE_EVIDENCE.unverifiableCount).toBe(rows.length);
  });

  it("shows what Germany really returns: validity, no name, no address", () => {
    const de = SAMPLE_EVIDENCE.rows.find((r) => r.vatNumber.startsWith("DE"));
    expect(de?.status).toBe("valid");
    expect(de?.traderName).toBeNull();
    expect(de?.traderAddress).toBeNull();
  });

  it("renders through the same PDF and CSV code as a paid order", async () => {
    const pdf = await toPdf(SAMPLE_EVIDENCE, SAMPLE_GENERATED_AT);
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const csv = toCsv(SAMPLE_EVIDENCE);
    expect(csv).toContain("vies_consultation_number");
    expect(csv).toContain("WAPIAAAAaSAMPLE1");
  });
});
