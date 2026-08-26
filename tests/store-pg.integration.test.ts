import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { setPoolForTesting, type PoolLike, query, queryOne } from "@/lib/db";
import { runFulfillment } from "@/lib/fulfillment";
import { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/ratelimit";
import { IllegalTransitionError } from "@/lib/state";
import { PgOrderStore } from "@/lib/store-pg";
import type { NewOrderItem } from "@/lib/types";
import { FakeRefunds, FakeVies, answer, permanentFailure, transientFailure } from "./helpers";
import type { ViesResult } from "@/lib/vies";

/**
 * Runs the real production SQL against a real Postgres. Skipped unless a
 * database is provided:
 *   TEST_DATABASE_URL=postgres://... npm test
 */
const url = process.env.TEST_DATABASE_URL;
const store = new PgOrderStore();
let pool: Pool;

const TABLES = ["ledger_entries", "order_items", "orders", "webhook_events", "idempotency_keys", "rate_limits"];

async function migrate(): Promise<void> {
  const dir = join(process.cwd(), "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

async function seed(id: string, vats: string[], amountTotal: number, token?: string): Promise<void> {
  const items: NewOrderItem[] = vats.map((v, i) => ({
    id: `${id.slice(0, 24)}${String(i).padStart(12, "0")}`,
    position: i + 1,
    countryCode: v.slice(0, 2) as NewOrderItem["countryCode"],
    vatNumber: v.slice(2),
  }));
  await store.createOrder(
    {
      id,
      publicToken: token ?? `tok-${id}`,
      requesterCountry: "SE",
      requesterVat: "556036079301",
      itemCount: items.length,
      amountTotal,
      currency: "eur",
      purgeAfter: new Date(Date.now() + 86_400_000),
      clientIpHash: null,
    },
    items,
  );
}

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

describe.skipIf(!url)("PgOrderStore against real Postgres", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 4 });
    setPoolForTesting(pool as unknown as PoolLike);
    await migrate();
    // Re-running migrations must be a no-op, not a crash.
    await migrate();
  });

  afterAll(async () => {
    setPoolForTesting(null);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  });

  it("stores an order and its rows, including batches larger than one insert chunk", async () => {
    const vats = Array.from({ length: 600 }, (_, i) => `SE${String(556036079301 + i)}`);
    await seed(ORDER_ID, vats, 12_000);

    const order = await store.getOrderByToken(`tok-${ORDER_ID}`);
    expect(order).toMatchObject({ status: "awaiting_payment", itemCount: 600, amountTotal: 12_000, amountRefunded: 0 });
    expect(await store.countItems(ORDER_ID)).toMatchObject({ total: 600, pending: 600 });
  });

  it("refuses two orders on the same public token", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await expect(
      seed("22222222-2222-4222-8222-222222222222", ["SE556036079301"], 490, `tok-${ORDER_ID}`),
    ).rejects.toThrow();
  });

  it("recognises payment exactly once", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    const facts = { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" };

    expect(await store.markPaid(ORDER_ID, facts)).toBe(true);
    expect(await store.markPaid(ORDER_ID, facts)).toBe(false);

    const order = await store.getOrderById(ORDER_ID);
    expect(order?.status).toBe("paid");
    expect(order?.paidAt).toBeInstanceOf(Date);
    expect(order?.stripePaymentIntentId).toBe("pi_1");
  });

  it("rejects an illegal transition before it reaches the database", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await expect(store.transition(ORDER_ID, ["awaiting_payment"], "fulfilled")).rejects.toThrow(IllegalTransitionError);
    expect((await store.getOrderById(ORDER_ID))?.status).toBe("awaiting_payment");
  });

  it("loses the race safely when two workers try the same transition", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await store.markPaid(ORDER_ID, { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" });

    const [a, b] = await Promise.all([
      store.transition(ORDER_ID, ["paid"], "processing"),
      store.transition(ORDER_ID, ["paid"], "processing"),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("stamps completed_at on terminal transitions only", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await store.markPaid(ORDER_ID, { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" });
    await store.transition(ORDER_ID, ["paid"], "processing");
    expect((await store.getOrderById(ORDER_ID))?.completedAt).toBeNull();
    await store.transition(ORDER_ID, ["processing"], "fulfilled");
    expect((await store.getOrderById(ORDER_ID))?.completedAt).toBeInstanceOf(Date);
  });

  it("honours item backoff when claiming due rows", async () => {
    await seed(ORDER_ID, ["SE556036079301", "FR40303265045"], 490);
    const items = await store.listItems(ORDER_ID);
    await store.applyResolution(items[0]!.id, {
      kind: "retry",
      error: "MS_UNAVAILABLE",
      nextAttemptAt: new Date(Date.now() + 3_600_000),
    });

    const due = await store.claimDueItems(ORDER_ID, 10);
    expect(due.map((i) => i.position)).toEqual([2]);
    expect((await store.listItems(ORDER_ID))[0]?.attempts).toBe(1);
  });

  it("will not overwrite a row that already has an answer", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    const [item] = await store.listItems(ORDER_ID);
    await store.applyResolution(item!.id, {
      kind: "answered",
      valid: true,
      requestIdentifier: "WAPI-1",
      requestDate: "2026-01-01T00:00:00Z",
      name: "ACME",
      address: "Street 1",
    });
    await store.applyResolution(item!.id, { kind: "failed", error: "should be ignored" });

    const after = (await store.listItems(ORDER_ID))[0];
    expect(after?.status).toBe("valid");
    expect(after?.viesRequestId).toBe("WAPI-1");
    expect(after?.attempts).toBe(1);
  });

  it("records a refund once and clamps it to what was paid", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await store.markPaid(ORDER_ID, { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" });

    expect(await store.recordRefund(ORDER_ID, 245, "re_1")).toBe(true);
    expect(await store.recordRefund(ORDER_ID, 245, "re_1")).toBe(false);
    expect((await store.getOrderById(ORDER_ID))?.amountRefunded).toBe(245);

    await store.recordRefund(ORDER_ID, 1000, "re_2");
    expect((await store.getOrderById(ORDER_ID))?.amountRefunded).toBe(490);
  });

  it("keeps the ledger append-only and free of duplicates", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    const entry = { orderId: ORDER_ID, kind: "charge" as const, amountMinor: 490, currency: "eur", reference: "pi_1", memo: "payment" };
    await store.recordLedger(entry);
    await store.recordLedger(entry);
    await store.recordLedger({ ...entry, kind: "stripe_fee", amountMinor: -32, reference: "ch_1" });

    const ledger = await store.listLedger(ORDER_ID);
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((s, e) => s + e.amountMinor, 0)).toBe(458);
  });

  it("gives the fulfillment lease to exactly one worker until it expires", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    expect(await store.acquireFulfillmentLock(ORDER_ID, 60_000)).toBe(true);
    expect(await store.acquireFulfillmentLock(ORDER_ID, 60_000)).toBe(false);
    await store.releaseFulfillmentLock(ORDER_ID);
    expect(await store.acquireFulfillmentLock(ORDER_ID, 60_000)).toBe(true);
  });

  it("reclaims a lease abandoned by a crashed worker", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await store.acquireFulfillmentLock(ORDER_ID, 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(await store.acquireFulfillmentLock(ORDER_ID, 60_000)).toBe(true);
  });

  it("finds only paid work that is actually due", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    expect(await store.findDueOrders(10)).toHaveLength(0); // unpaid

    await store.markPaid(ORDER_ID, { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" });
    expect(await store.findDueOrders(10)).toHaveLength(1);

    await store.bumpOrderAttempt(ORDER_ID, new Date(Date.now() + 3_600_000), "backing off");
    expect(await store.findDueOrders(10)).toHaveLength(0);
  });

  it("expires abandoned checkouts without touching paid ones", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await seed("33333333-3333-4333-8333-333333333333", ["FR40303265045"], 490);
    await store.markPaid("33333333-3333-4333-8333-333333333333", {
      paymentIntentId: "pi_2",
      chargeId: "ch_2",
      amountTotalMinor: 490,
      currency: "eur",
    });

    expect(await store.expireStaleOrders(new Date(Date.now() + 1000), 100)).toBe(1);
    expect((await store.getOrderById(ORDER_ID))?.status).toBe("expired");
    expect((await store.getOrderById("33333333-3333-4333-8333-333333333333"))?.status).toBe("paid");
  });

  it("claims each webhook event id once, enforced by the database", async () => {
    expect(await store.beginWebhookEvent("evt_1", "checkout.session.completed")).toBe(true);
    expect(await store.beginWebhookEvent("evt_1", "checkout.session.completed")).toBe(false);
    await store.finishWebhookEvent("evt_1", null);
    const row = await queryOne<{ processed_at: Date | null }>("SELECT processed_at FROM webhook_events WHERE event_id = $1", ["evt_1"]);
    expect(row?.processed_at).toBeInstanceOf(Date);
  });

  it("purges identifying data after the retention window but keeps the ledger", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await store.recordLedger({ orderId: ORDER_ID, kind: "charge", amountMinor: 490, currency: "eur", reference: "pi_1", memo: "payment" });
    await query("UPDATE orders SET purge_after = now() - interval '1 day' WHERE id = $1", [ORDER_ID]);

    expect(await store.purgeExpired(new Date(), 100)).toBe(1);
    const order = await store.getOrderById(ORDER_ID);
    expect(order?.requesterVat).toBe("(purged)");
    expect(order?.purgedAt).toBeInstanceOf(Date);
    expect((await store.listItems(ORDER_ID))[0]?.vatNumber).toBe("(purged)");
    expect(await store.listLedger(ORDER_ID)).toHaveLength(1);
    // Purging is not repeated on the next sweep.
    expect(await store.purgeExpired(new Date(), 100)).toBe(0);
  });

  it("keeps updated_at honest via the database trigger", async () => {
    await seed(ORDER_ID, ["SE556036079301"], 490);
    const before = await queryOne<{ updated_at: Date }>("SELECT updated_at FROM orders WHERE id = $1", [ORDER_ID]);
    await new Promise((r) => setTimeout(r, 15));
    await store.markPaid(ORDER_ID, { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" });
    const after = await queryOne<{ updated_at: Date }>("SELECT updated_at FROM orders WHERE id = $1", [ORDER_ID]);
    expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
  });

  it("replays an idempotent order creation instead of creating a second one", async () => {
    const first = await claimIdempotencyKey("key-1", "hash-a");
    expect(first.claimed).toBe(true);
    await seed(ORDER_ID, ["SE556036079301"], 490);
    await completeIdempotencyKey("key-1", ORDER_ID, { orderToken: `tok-${ORDER_ID}` });

    const replay = await claimIdempotencyKey("key-1", "hash-a");
    expect(replay.claimed).toBe(false);
    if (!replay.claimed) {
      expect(replay.existing.orderId).toBe(ORDER_ID);
      expect(replay.existing.response).toMatchObject({ orderToken: `tok-${ORDER_ID}` });
    }

    const conflict = await claimIdempotencyKey("key-1", "hash-b");
    expect(conflict.claimed).toBe(false);
    if (!conflict.claimed) expect(conflict.existing.requestHash).toBe("hash-a");
  });

  it("frees an idempotency key whose order never got created", async () => {
    await claimIdempotencyKey("key-2", "hash-a");
    await releaseIdempotencyKey("key-2");
    expect((await claimIdempotencyKey("key-2", "hash-a")).claimed).toBe(true);
  });

  it("counts rate limit hits inside a window and lets the next window through", async () => {
    for (let i = 1; i <= 3; i++) {
      const verdict = await rateLimit("test-bucket", 3, 60_000);
      expect(verdict.allowed).toBe(true);
    }
    expect((await rateLimit("test-bucket", 3, 60_000)).allowed).toBe(false);
    expect((await rateLimit("other-bucket", 3, 60_000)).allowed).toBe(true);
  });

  it("runs the whole money path through real SQL: verify, dead-letter, refund, settle", async () => {
    // Real clock here: Postgres stamps next_attempt_at with its own now().
    await seed(ORDER_ID, ["SE556036079301", "FR40303265045", "IT00743110157", "DE811907980"], 490);
    await store.markPaid(ORDER_ID, { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" });
    await store.recordLedger({ orderId: ORDER_ID, kind: "charge", amountMinor: 490, currency: "eur", reference: "pi_1", memo: "payment" });

    const vies = new FakeVies(
      new Map<string, ViesResult[]>([
        ["FR40303265045", [answer(false)]],
        ["DE811907980", [transientFailure(), permanentFailure("VAT_BLOCKED")]],
      ]),
    );
    const refunds = new FakeRefunds();
    const deps = { store, vies, refunds, budgetMs: 20_000, maxAttempts: 8, concurrency: 3, backoff: () => 400 };

    const first = await runFulfillment((await store.getOrderById(ORDER_ID))!, deps);
    expect(first).toMatchObject({ kind: "ran", status: "processing", remaining: 1 });

    await new Promise((r) => setTimeout(r, 450));
    const second = await runFulfillment((await store.getOrderById(ORDER_ID))!, deps);
    expect(second).toMatchObject({ kind: "ran", status: "partially_refunded", remaining: 0 });

    const settled = await store.getOrderById(ORDER_ID);
    expect(settled?.status).toBe("partially_refunded");
    expect(settled?.amountRefunded).toBe(123);
    expect(refunds.calls).toHaveLength(1);

    const counts = await store.countItems(ORDER_ID);
    expect(counts).toMatchObject({ valid: 2, invalid: 1, failed: 1, pending: 0 });

    const ledger = await store.listLedger(ORDER_ID);
    expect(ledger.reduce((s, e) => s + e.amountMinor, 0)).toBe(367);

    const items = await store.listItems(ORDER_ID);
    expect(items.filter((i) => i.viesRequestId).length).toBe(2);
    expect(items.find((i) => i.vatNumber === "811907980")?.refunded).toBe(true);

    // A third pass on a settled order must do nothing at all.
    const third = await runFulfillment(settled!, deps);
    expect(third).toEqual({ kind: "skipped", reason: "terminal" });
    expect(refunds.calls).toHaveLength(1);
  });
});
