import { describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  ORDER_STATUSES,
  assertTransition,
  canTransition,
  isFulfillable,
  isPaid,
  isTerminal,
  outcomeFor,
} from "@/lib/state";

describe("order state machine", () => {
  it("cannot fulfil, refund or complete an order before it is paid", () => {
    expect(isFulfillable("awaiting_payment")).toBe(false);
    expect(isPaid("awaiting_payment")).toBe(false);
    for (const to of ["fulfilled", "partially_refunded", "refunded_failed", "refunded", "processing"] as const) {
      expect(canTransition("awaiting_payment", to)).toBe(false);
    }
  });

  it("only allows payment or expiry out of awaiting_payment", () => {
    expect(canTransition("awaiting_payment", "paid")).toBe(true);
    expect(canTransition("awaiting_payment", "expired")).toBe(true);
  });

  it("cannot resurrect a terminal order", () => {
    for (const from of ["refunded_failed", "refunded", "expired"] as const) {
      for (const to of ORDER_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("cannot take money for an order that already expired", () => {
    expect(canTransition("expired", "paid")).toBe(false);
    expect(() => assertTransition("expired", "paid")).toThrow(IllegalTransitionError);
  });

  it("allows a settled order to be refunded out of band, but not re-fulfilled", () => {
    expect(canTransition("fulfilled", "refunded")).toBe(true);
    expect(canTransition("partially_refunded", "refunded")).toBe(true);
    expect(canTransition("fulfilled", "processing")).toBe(false);
  });

  it("marks exactly the settled statuses terminal", () => {
    expect(isTerminal("processing")).toBe(false);
    expect(isTerminal("paid")).toBe(false);
    expect(isTerminal("fulfilled")).toBe(true);
    expect(isTerminal("partially_refunded")).toBe(true);
    expect(isTerminal("refunded_failed")).toBe(true);
    expect(isTerminal("expired")).toBe(true);
  });
});

describe("outcomeFor", () => {
  it("keeps the money when every row was answered", () => {
    expect(outcomeFor(10, 0)).toEqual({ status: "fulfilled", refundRows: 0 });
  });
  it("refunds only the unanswerable rows", () => {
    expect(outcomeFor(10, 3)).toEqual({ status: "partially_refunded", refundRows: 3 });
  });
  it("refunds everything when nothing was answered", () => {
    expect(outcomeFor(10, 10)).toEqual({ status: "refunded_failed", refundRows: 10 });
    expect(outcomeFor(10, 99)).toEqual({ status: "refunded_failed", refundRows: 10 });
  });
});
