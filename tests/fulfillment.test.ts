import { beforeEach, describe, expect, it } from "vitest";
import { runFulfillment } from "@/lib/fulfillment";
import { MemoryOrderStore } from "@/lib/testing/memory-store";
import type { ViesResult } from "@/lib/vies";
import {
  FakeRefunds,
  FakeVies,
  answer,
  makeClock,
  permanentFailure,
  seedPaidOrder,
  transientFailure,
} from "./helpers";

const noBackoff = () => 1000;

function deps(store: MemoryOrderStore, vies: FakeVies, refunds: FakeRefunds, clock: ReturnType<typeof makeClock>, maxAttempts = 8) {
  return { store, vies, refunds, now: clock.now, budgetMs: 60_000, maxAttempts, concurrency: 4, backoff: noBackoff };
}

describe("fulfillment: the money path", () => {
  let store: MemoryOrderStore;
  let refunds: FakeRefunds;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    clock = makeClock();
    store = new MemoryOrderStore();
    store.now = clock.now;
    refunds = new FakeRefunds();
  });

  it("verifies every row, keeps the money and completes", async () => {
    const order = await seedPaidOrder(store, { vats: ["SE556036079301", "FR40303265045", "IT00743110157"], amountTotal: 490 });
    const vies = new FakeVies(new Map());

    const outcome = await runFulfillment(order, deps(store, vies, refunds, clock));

    expect(outcome).toMatchObject({ kind: "ran", answered: 3, failed: 0, remaining: 0, status: "fulfilled" });
    expect(refunds.calls).toHaveLength(0);
    expect((await store.getOrderById(order.id))?.status).toBe("fulfilled");
    expect((await store.getOrderById(order.id))?.amountRefunded).toBe(0);
    expect(store.marginFor(order.id)).toBe(490);
  });

  it("always sends the requester VAT number, because that is what buys the consultation number", async () => {
    const order = await seedPaidOrder(store, { vats: ["FR40303265045"], amountTotal: 490 });
    const vies = new FakeVies(new Map());

    await runFulfillment(order, deps(store, vies, refunds, clock));

    expect(vies.calls).toHaveLength(1);
    expect(vies.calls[0]?.requester).toBe("SE556036079301");
    const items = await store.listItems(order.id);
    expect(items[0]?.viesRequestId).toBeTruthy();
  });

  it("treats 'not valid' as a billable answer, not a failure", async () => {
    const order = await seedPaidOrder(store, { vats: ["SE556036079301", "FR40303265045"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["FR40303265045", [answer(false)]]]));

    const outcome = await runFulfillment(order, deps(store, vies, refunds, clock));

    expect(outcome).toMatchObject({ status: "fulfilled", failed: 0 });
    expect(refunds.calls).toHaveLength(0);
    const counts = await store.countItems(order.id);
    expect(counts).toMatchObject({ valid: 1, invalid: 1, failed: 0, pending: 0 });
  });

  it("retries a transient member-state outage across passes and then completes", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "SE556036079301"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["DE811907980", [transientFailure(), answer(true)]]]));

    const first = await runFulfillment(order, deps(store, vies, refunds, clock));
    expect(first).toMatchObject({ remaining: 1, status: "processing" });
    expect((await store.getOrderById(order.id))?.status).toBe("processing");

    clock.advance(5000);
    const resumed = await store.getOrderById(order.id);
    const second = await runFulfillment(resumed!, deps(store, vies, refunds, clock));

    expect(second).toMatchObject({ remaining: 0, status: "fulfilled" });
    expect(refunds.calls).toHaveLength(0);
    expect((await store.countItems(order.id)).valid).toBe(2);
  });

  it("dead-letters a row after the attempt ceiling and refunds it pro rata", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "SE556036079301", "FR40303265045", "IT00743110157"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["DE811907980", [transientFailure()]]]));

    let current = order;
    for (let pass = 0; pass < 5; pass++) {
      await runFulfillment(current, deps(store, vies, refunds, clock, 3));
      clock.advance(5000);
      current = (await store.getOrderById(order.id))!;
    }

    expect(current.status).toBe("partially_refunded");
    expect(refunds.calls).toHaveLength(1);
    // 490c paid, 1 of 4 rows unanswerable -> 123c back.
    expect(refunds.calls[0]?.amountMinor).toBe(123);
    expect(current.amountRefunded).toBe(123);
    expect(store.marginFor(order.id)).toBe(490 - 123);
    const items = await store.listItems(order.id);
    expect(items.find((i) => i.vatNumber === "811907980")?.refunded).toBe(true);
  });

  it("does not retry a permanently rejected row", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "SE556036079301"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["DE811907980", [permanentFailure()]]]));

    const outcome = await runFulfillment(order, deps(store, vies, refunds, clock));

    expect(outcome).toMatchObject({ status: "partially_refunded", failed: 1, remaining: 0 });
    expect(vies.calls.filter((c) => c.vat === "DE811907980")).toHaveLength(1);
    expect(refunds.calls[0]?.amountMinor).toBe(245);
  });

  it("refunds the whole order when nothing at all could be verified", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "DE811907981"], amountTotal: 490 });
    const vies = new FakeVies(
      new Map<string, ViesResult[]>([
        ["DE811907980", [permanentFailure()]],
        ["DE811907981", [permanentFailure()]],
      ]),
    );

    const outcome = await runFulfillment(order, deps(store, vies, refunds, clock));

    expect(outcome.kind).toBe("ran");
    expect((await store.getOrderById(order.id))?.status).toBe("refunded_failed");
    expect(refunds.calls[0]?.amountMinor).toBe(490);
    expect(store.marginFor(order.id)).toBe(0);
  });

  it("never refunds twice, however many passes run", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "SE556036079301"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["DE811907980", [permanentFailure()]]]));

    await runFulfillment(order, deps(store, vies, refunds, clock));
    const settled = (await store.getOrderById(order.id))!;
    const again = await runFulfillment(settled, deps(store, vies, refunds, clock));

    expect(again).toEqual({ kind: "skipped", reason: "terminal" });
    expect(refunds.calls).toHaveLength(1);
    expect(settled.amountRefunded).toBe(245);
    expect(store.ledger.filter((e) => e.kind === "refund")).toHaveLength(1);
  });

  it("keeps the refund obligation when Stripe is down, and settles it on the next pass", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "SE556036079301"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["DE811907980", [permanentFailure()]]]));
    refunds.failures = 1;

    await expect(runFulfillment(order, deps(store, vies, refunds, clock))).rejects.toThrow("stripe unavailable");

    const stuck = (await store.getOrderById(order.id))!;
    expect(stuck.status).toBe("processing");
    expect(stuck.amountRefunded).toBe(0);

    clock.advance(5000);
    const recovered = await runFulfillment(stuck, deps(store, vies, refunds, clock));

    expect(recovered).toMatchObject({ status: "partially_refunded" });
    expect(refunds.calls).toHaveLength(1);
    expect((await store.getOrderById(order.id))?.amountRefunded).toBe(245);
  });

  it("uses a stable Stripe idempotency key so a duplicated refund call is a no-op upstream", async () => {
    const order = await seedPaidOrder(store, { vats: ["DE811907980", "SE556036079301"], amountTotal: 490 });
    const vies = new FakeVies(new Map<string, ViesResult[]>([["DE811907980", [permanentFailure()]]]));

    await runFulfillment(order, deps(store, vies, refunds, clock));
    const key = refunds.calls[0]?.idempotencyKey;

    // Replaying the same refund with the same key must not move more money.
    const replay = await refunds.refund({ paymentIntentId: "pi_order-1", amountMinor: 245, idempotencyKey: key!, reason: "replay" });
    expect(replay.id).toBe("re_1");
    const recorded = await store.recordRefund(order.id, 245, replay.id);
    expect(recorded).toBe(false);
    expect((await store.getOrderById(order.id))?.amountRefunded).toBe(245);
  });

  it("refuses to fulfil an order that has not been paid for", async () => {
    await store.createOrder(
      {
        id: "unpaid",
        publicToken: "tok-unpaid",
        requesterCountry: "SE",
        requesterVat: "556036079301",
        itemCount: 1,
        amountTotal: 490,
        currency: "eur",
        purgeAfter: new Date("2099-01-01T00:00:00.000Z"),
        clientIpHash: null,
      },
      [{ id: "i1", position: 1, countryCode: "SE", vatNumber: "556036079301" }],
    );
    const unpaid = (await store.getOrderById("unpaid"))!;
    const vies = new FakeVies(new Map());

    const outcome = await runFulfillment(unpaid, deps(store, vies, refunds, clock));

    expect(outcome).toEqual({ kind: "skipped", reason: "not_payable" });
    expect(vies.calls).toHaveLength(0);
  });

  it("lets only one pass touch an order at a time", async () => {
    const order = await seedPaidOrder(store, { vats: ["SE556036079301"], amountTotal: 490 });
    const vies = new FakeVies(new Map());

    await store.acquireFulfillmentLock(order.id, 60_000);
    const outcome = await runFulfillment(order, deps(store, vies, refunds, clock));

    expect(outcome).toEqual({ kind: "skipped", reason: "locked" });
    expect(vies.calls).toHaveLength(0);
  });

  it("charges for exactly the rows ordered and never calls upstream twice for a resolved row", async () => {
    const order = await seedPaidOrder(store, { vats: ["SE556036079301", "FR40303265045"], amountTotal: 490 });
    const vies = new FakeVies(new Map());

    await runFulfillment(order, deps(store, vies, refunds, clock));
    const settled = (await store.getOrderById(order.id))!;
    await runFulfillment(settled, deps(store, vies, refunds, clock));

    expect(vies.calls).toHaveLength(2);
  });
});
