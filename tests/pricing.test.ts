import { describe, expect, it } from "vitest";
import {
  MINIMUM_ORDER_MINOR,
  TIERS,
  extraNumbersCoveredByMinimum,
  firstCountWithoutMinimum,
  formatLiveQuoteHint,
  formatMinor,
  minimumFloorExplanation,
  quote,
  refundForFailedRows,
} from "@/lib/pricing";

describe("quote", () => {
  it("applies the minimum order to small batches", () => {
    const q = quote(1);
    expect(q.subtotalMinor).toBe(39);
    expect(q.totalMinor).toBe(MINIMUM_ORDER_MINOR);
    expect(q.minimumApplied).toBe(true);
  });

  it("stops applying the minimum once the subtotal exceeds it", () => {
    // 13 rows x 39c = 507c, just above the 490c minimum.
    const q = quote(13);
    expect(q.subtotalMinor).toBe(507);
    expect(q.totalMinor).toBe(507);
    expect(q.minimumApplied).toBe(false);
  });

  it("charges marginal tier prices, not a flat rate", () => {
    expect(quote(25).totalMinor).toBe(25 * 39);
    expect(quote(100).totalMinor).toBe(25 * 39 + 75 * 19);
    expect(quote(1000).totalMinor).toBe(25 * 39 + 225 * 19 + 750 * 11);
    expect(quote(5000).totalMinor).toBe(25 * 39 + 225 * 19 + 1750 * 11 + 3000 * 7);
  });

  it("never gets cheaper in absolute terms as rows are added", () => {
    let previous = 0;
    for (const n of [1, 2, 13, 25, 26, 100, 250, 251, 999, 2000, 2001, 5000]) {
      const total = quote(n).totalMinor;
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });

  it("has a monotonically decreasing unit price across tiers", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i]!.unitMinor).toBeLessThan(TIERS[i - 1]!.unitMinor);
    }
  });

  it("rejects nonsense row counts rather than pricing them", () => {
    expect(() => quote(0)).toThrow();
    expect(() => quote(-3)).toThrow();
    expect(() => quote(2.5)).toThrow();
  });

  it("formats money in euro", () => {
    expect(formatMinor(490)).toContain("4.90");
  });
});

describe("minimum floor copy", () => {
  it("knows when the tier rate actually applies", () => {
    expect(firstCountWithoutMinimum()).toBe(13);
    expect(quote(12).minimumApplied).toBe(true);
    expect(quote(13).minimumApplied).toBe(false);
    expect(extraNumbersCoveredByMinimum(1)).toBe(11);
    expect(extraNumbersCoveredByMinimum(12)).toBe(0);
    expect(extraNumbersCoveredByMinimum(13)).toBe(0);
  });

  it("says an 11-row batch pays the floor, not €0.39 each", () => {
    const q = quote(11);
    expect(q.totalMinor).toBe(490);
    expect(q.effectiveUnitMinor).toBe(45);
    const line = formatLiveQuoteHint(q);
    expect(line).toMatch(/11 billable/);
    expect(line).toMatch(/4\.90/);
    expect(line).toMatch(/0\.39/);
    expect(line).toMatch(/4\.29/);
    expect(line).toMatch(/0\.45/);
    expect(line).toMatch(/until the minimum is covered/);
  });

  it("does not mention the floor once the tier subtotal covers it", () => {
    const line = formatLiveQuoteHint(quote(15));
    expect(line).toMatch(/15 billable/);
    expect(line).not.toMatch(/minimum applied/);
  });

  it("states the floor next to the published tier table", () => {
    const copy = minimumFloorExplanation();
    expect(copy).toMatch(/Minimum order/);
    expect(copy).toMatch(/4\.90/);
    expect(copy).toMatch(/0\.39/);
    expect(copy).toMatch(/13 numbers/);
    expect(copy).toMatch(/effective rate is higher/);
  });
});

describe("refundForFailedRows", () => {
  it("refunds nothing when every row was answered", () => {
    expect(refundForFailedRows({ amountTotalMinor: 2400, amountRefundedMinor: 0, totalRows: 100, failedRows: 0 })).toBe(0);
  });

  it("refunds the full amount when no row could be answered", () => {
    expect(refundForFailedRows({ amountTotalMinor: 2400, amountRefundedMinor: 0, totalRows: 100, failedRows: 100 })).toBe(2400);
  });

  it("refunds pro rata on what was actually paid, minimum included", () => {
    // 4 rows priced at the 490c minimum; one row unanswerable.
    expect(refundForFailedRows({ amountTotalMinor: 490, amountRefundedMinor: 0, totalRows: 4, failedRows: 1 })).toBe(123);
  });

  it("never refunds more than what remains unrefunded", () => {
    expect(refundForFailedRows({ amountTotalMinor: 1000, amountRefundedMinor: 900, totalRows: 10, failedRows: 10 })).toBe(100);
    expect(refundForFailedRows({ amountTotalMinor: 1000, amountRefundedMinor: 1000, totalRows: 10, failedRows: 10 })).toBe(0);
  });

  it("clamps impossible inputs instead of over-refunding", () => {
    expect(refundForFailedRows({ amountTotalMinor: 1000, amountRefundedMinor: 0, totalRows: 5, failedRows: 99 })).toBe(1000);
    expect(refundForFailedRows({ amountTotalMinor: 1000, amountRefundedMinor: 0, totalRows: 0, failedRows: 3 })).toBe(0);
  });
});
