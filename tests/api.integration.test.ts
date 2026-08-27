import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import Stripe from "stripe";

/**
 * End-to-end money path at the HTTP handler level, against real Postgres.
 * Stripe and VIES are the only things faked - everything between them is the
 * production code path: validation, pricing, idempotency, webhook signature
 * verification, the state machine, fulfillment, refunds and delivery.
 */
const url = process.env.TEST_DATABASE_URL;

const WEBHOOK_SECRET = "whsec_integration_secret";
process.env.DATABASE_URL = url ?? "postgres://unused";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_unit_tests";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.APP_URL = "https://vatproof.test";
process.env.CRON_SECRET = "cron-secret-0123456789";
process.env.RATE_LIMIT_PER_MINUTE = "3";
process.env.RATE_LIMIT_PER_HOUR = "500";

/** Callbacks Next would run after the response; the tests flush them explicitly. */
const afterQueue: Array<() => Promise<unknown> | unknown> = [];
async function flushAfter(): Promise<void> {
  while (afterQueue.length > 0) {
    const fn = afterQueue.shift();
    if (fn) await fn();
  }
}

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => Promise<unknown> | unknown) => afterQueue.push(fn) };
});

/** Scriptable VIES stand-in shared with the tests. */
const viesScript = new Map<string, { valid: boolean } | { failCode: string; retryable: boolean }>();

vi.mock("@/lib/vies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vies")>();
  class FakeHttpViesClient {
    async check(params: { countryCode: string; vatNumber: string }) {
      const scripted = viesScript.get(`${params.countryCode}${params.vatNumber}`);
      if (scripted && "failCode" in scripted) {
        return { kind: "failure", code: scripted.failCode, retryable: scripted.retryable, message: scripted.failCode };
      }
      const valid = scripted?.valid ?? true;
      return {
        kind: "answer",
        valid,
        requestIdentifier: valid ? `WAPI-${params.countryCode}${params.vatNumber}` : null,
        requestDate: "2026-01-01T00:00:00.000Z",
        name: valid ? "ACME AB" : null,
        address: valid ? "Street 1" : null,
      };
    }
  }
  return { ...actual, HttpViesClient: FakeHttpViesClient };
});

/** Payment intents the Stripe stand-in cannot resolve, as after an account switch. */
const unresolvableIntents = new Set<string>();

const refundCalls: Array<{ amountMinor: number; idempotencyKey: string }> = [];
let checkoutCounter = 0;

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    createCheckoutSession: async (input: { orderId: string; publicToken: string; amountMinor: number }) => ({
      id: `cs_test_${++checkoutCounter}`,
      url: `https://checkout.stripe.test/${input.publicToken}`,
      amount_total: input.amountMinor,
    }),
    // Mirrors the real shape: Stripe settles in SEK, the order is priced in
    // EUR, so the entry booked into the ledger must be the converted one.
    fetchChargeFee: async () => ({
      feeMinor: 32,
      currency: "eur",
      settledMinor: 355,
      settledCurrency: "sek",
      chargeId: "ch_test",
    }),
    fetchFeeForPaymentIntent: async (paymentIntentId: string) => {
      if (unresolvableIntents.has(paymentIntentId)) {
        throw new Stripe.errors.StripeInvalidRequestError({
          type: "invalid_request_error",
          message: `No such payment_intent: '${paymentIntentId}'`,
          code: "resource_missing",
        });
      }
      return { feeMinor: 32, currency: "eur", settledMinor: 355, settledCurrency: "sek", chargeId: "ch_test" };
    },
    stripeRefunds: {
      refund: async (params: { amountMinor: number; idempotencyKey: string }) => {
        refundCalls.push({ ...params });
        return { id: `re_test_${refundCalls.length}` };
      },
    },
  };
});

const stripeSigner = new Stripe("sk_test_dummy_key_for_unit_tests", { apiVersion: "2025-08-27.basil" });

let pool: Pool;
let ordersRoute: typeof import("@/app/api/orders/route");
let statusRoute: typeof import("@/app/api/orders/[token]/route");
let webhookRoute: typeof import("@/app/api/stripe/webhook/route");
let csvRoute: typeof import("@/app/api/orders/[token]/results.csv/route");
let pdfRoute: typeof import("@/app/api/orders/[token]/evidence.pdf/route");
let cronRoute: typeof import("@/app/api/cron/reconcile/route");
let listRoute: typeof import("@/app/api/orders/[token]/list/route");
let checkRoute: typeof import("@/app/api/check/route");
let db: typeof import("@/lib/db");

const TABLES = [
  "vatproof.ledger_entries",
  "vatproof.order_items",
  "vatproof.orders",
  "vatproof.webhook_events",
  "vatproof.idempotency_keys",
  "vatproof.rate_limits",
];

function orderRequest(body: unknown, ip: string): Request {
  return new Request("https://vatproof.test/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function webhookRequest(event: unknown, opts: { secret?: string } = {}): Request {
  const payload = JSON.stringify(event);
  const signature = stripeSigner.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? WEBHOOK_SECRET,
  });
  return new Request("https://vatproof.test/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}

function paidEvent(id: string, orderId: string, sessionId: string, amount: number) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: amount,
        currency: "eur",
        payment_intent: `pi_${orderId}`,
        metadata: { order_id: orderId, public_token: `tok` },
      },
    },
  };
}

describe.skipIf(!url)("HTTP money path", () => {
  beforeAll(async () => {
    db = await import("@/lib/db");
    pool = new Pool({ connectionString: url, max: 4 });
    db.setPoolForTesting(pool as unknown as import("@/lib/db").PoolLike);

    const dir = join(process.cwd(), "db", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await pool.query(readFileSync(join(dir, file), "utf8"));
    }

    ordersRoute = await import("@/app/api/orders/route");
    statusRoute = await import("@/app/api/orders/[token]/route");
    webhookRoute = await import("@/app/api/stripe/webhook/route");
    csvRoute = await import("@/app/api/orders/[token]/results.csv/route");
    pdfRoute = await import("@/app/api/orders/[token]/evidence.pdf/route");
    cronRoute = await import("@/app/api/cron/reconcile/route");
    listRoute = await import("@/app/api/orders/[token]/list/route");
    checkRoute = await import("@/app/api/check/route");
  });

  afterAll(async () => {
    db.setPoolForTesting(null);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    afterQueue.length = 0;
    refundCalls.length = 0;
    viesScript.clear();
    unresolvableIntents.clear();
  });

  async function placeOrder(vats: string[], ip = "203.0.113.10", key = "idem-key-1") {
    const res = await ordersRoute.POST(
      orderRequest({ requesterVat: "SE556036079301", vatNumbers: vats, idempotencyKey: key }, ip) as never,
    );
    return { res, body: (await res.json()) as Record<string, unknown> };
  }

  it("prices, persists and hands back a checkout URL without taking money yet", async () => {
    const { res, body } = await placeOrder(["SE556036079301", "FR40303265045"]);

    expect(res.status).toBe(201);
    expect(body.amountMinor).toBe(490); // minimum order
    expect(body.itemCount).toBe(2);
    expect(String(body.checkoutUrl)).toContain("checkout.stripe.test");

    const rows = await pool.query("SELECT status, amount_total FROM vatproof.orders");
    expect(rows.rows[0]).toMatchObject({ status: "awaiting_payment", amount_total: 490 });
    expect((await pool.query("SELECT * FROM vatproof.ledger_entries")).rowCount).toBe(0);
  });

  it("refuses a malformed VAT number instead of charging for it", async () => {
    const { res, body } = await placeOrder(["SE556036079301", "not-a-vat"]);
    expect(res.status).toBe(400);
    expect(String(body.message)).toContain("not-a-vat");
    expect((await pool.query("SELECT * FROM vatproof.orders")).rowCount).toBe(0);
  });

  it("requires the requester's own VAT number, because it is what buys the evidence", async () => {
    const res = await ordersRoute.POST(
      orderRequest({ requesterVat: "nonsense", vatNumbers: ["SE556036079301"], idempotencyKey: "k" }, "203.0.113.11") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns the first response on an idempotent replay rather than a second order", async () => {
    const first = await placeOrder(["SE556036079301"], "203.0.113.12", "replay-key");
    const second = await placeOrder(["SE556036079301"], "203.0.113.12", "replay-key");

    expect(first.res.status).toBe(201);
    expect(second.res.status).toBe(200);
    expect(second.body.orderToken).toBe(first.body.orderToken);
    expect((await pool.query("SELECT * FROM vatproof.orders")).rowCount).toBe(1);
  });

  it("rejects an idempotency key reused for different contents", async () => {
    await placeOrder(["SE556036079301"], "203.0.113.13", "conflict-key");
    const { res } = await placeOrder(["FR40303265045"], "203.0.113.13", "conflict-key");
    expect(res.status).toBe(409);
  });

  it("rate limits order creation per address", async () => {
    for (let i = 0; i < 3; i++) {
      const { res } = await placeOrder(["SE556036079301"], "203.0.113.99", `ratelimit-key-${i}`);
      expect(res.status).toBe(201);
    }
    const { res } = await placeOrder(["SE556036079301"], "203.0.113.99", "ratelimit-key-overflow");
    expect(res.status).toBe(429);
  });

  it("ignores a webhook whose signature does not verify", async () => {
    const res = await webhookRoute.POST(
      webhookRequest(paidEvent("evt_bad", "o", "cs", 490), { secret: "whsec_wrong" }) as never,
    );
    expect(res.status).toBe(400);
    expect((await pool.query("SELECT * FROM vatproof.webhook_events")).rowCount).toBe(0);
  });

  it("carries an order from payment to delivered evidence with no human involved", async () => {
    viesScript.set("FR40303265045", { valid: false });
    viesScript.set("DE811907980", { failCode: "VAT_BLOCKED", retryable: false });

    const { body } = await placeOrder(
      ["SE556036079301", "FR40303265045", "IT00743110157", "DE811907980"],
      "203.0.113.20",
      "end-to-end-key",
    );
    const token = String(body.orderToken);
    const order = (await pool.query<{ id: string; stripe_session_id: string }>("SELECT id, stripe_session_id FROM vatproof.orders")).rows[0]!;

    // 1. Stripe confirms payment.
    const webhookRes = await webhookRoute.POST(
      webhookRequest(paidEvent("evt_paid", order.id, order.stripe_session_id, 490)) as never,
    );
    expect(webhookRes.status).toBe(200);
    expect((await pool.query("SELECT status FROM vatproof.orders")).rows[0]).toMatchObject({ status: "paid" });
    expect(
      (await pool.query("SELECT amount_minor FROM vatproof.ledger_entries WHERE kind = 'charge'")).rows[0],
    ).toMatchObject({ amount_minor: 490 });

    // 2. Fulfillment runs in the background work Next would schedule after the 200.
    await flushAfter();

    // 3. One row was unanswerable, so a pro-rata refund was issued automatically.
    const settled = (await pool.query<{ status: string; amount_refunded: number }>("SELECT status, amount_refunded FROM vatproof.orders")).rows[0]!;
    expect(settled.status).toBe("partially_refunded");
    expect(settled.amount_refunded).toBe(123);
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]?.idempotencyKey).toContain(order.id);

    // 4. The customer's status endpoint reports a finished order.
    const statusRes = await statusRoute.GET(new Request("https://vatproof.test") as never, {
      params: Promise.resolve({ token }),
    });
    const status = (await statusRes.json()) as Record<string, unknown>;
    expect(status).toMatchObject({ done: true, status: "partially_refunded", downloadsReady: true });
    expect(status.counts).toMatchObject({ valid: 2, invalid: 1, unverifiable: 1, pending: 0 });

    // 5. Both deliverables are generated on demand from the database.
    const csvRes = await csvRoute.GET(new Request("https://vatproof.test") as never, { params: Promise.resolve({ token }) });
    const csv = await csvRes.text();
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("x-evidence-seal")).toMatch(/^[0-9a-f]{64}$/);
    expect(csv).toContain("WAPI-SE556036079301");
    expect(csv).toContain("unverifiable");

    const pdfRes = await pdfRoute.GET(new Request("https://vatproof.test") as never, { params: Promise.resolve({ token }) });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdfRes.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // 6. A redelivered webhook changes nothing.
    const replay = await webhookRoute.POST(
      webhookRequest(paidEvent("evt_paid", order.id, order.stripe_session_id, 490)) as never,
    );
    expect((await replay.json()) as Record<string, unknown>).toMatchObject({ duplicate: true });
    expect((await pool.query("SELECT * FROM vatproof.ledger_entries WHERE kind = 'charge'")).rowCount).toBe(1);
    expect(refundCalls).toHaveLength(1);
  });

  it("books the Stripe fee so the ledger shows real margin", async () => {
    const { body } = await placeOrder(["SE556036079301"], "203.0.113.21", "stripe-fee-key");
    expect(body.orderToken).toBeTruthy();
    const order = (await pool.query<{ id: string; stripe_session_id: string }>("SELECT id, stripe_session_id FROM vatproof.orders")).rows[0]!;

    await webhookRoute.POST(webhookRequest(paidEvent("evt_paid_2", order.id, order.stripe_session_id, 490)) as never);
    await webhookRoute.POST(
      webhookRequest({
        id: "evt_charge",
        object: "event",
        type: "charge.succeeded",
        data: { object: { id: "ch_1", object: "charge", metadata: { order_id: order.id } } },
      }) as never,
    );
    await flushAfter();

    const total = await pool.query<{ sum: string }>("SELECT COALESCE(SUM(amount_minor), 0)::text AS sum FROM vatproof.ledger_entries");
    expect(Number(total.rows[0]!.sum)).toBe(490 - 32);
  });

  it("books the fee even when Stripe sends a charge without our metadata", async () => {
    const { body } = await placeOrder(["SE556036079301"], "203.0.113.25", "no-metadata-key");
    expect(body.orderToken).toBeTruthy();
    const order = (await pool.query<{ id: string; stripe_session_id: string }>("SELECT id, stripe_session_id FROM vatproof.orders")).rows[0]!;

    await webhookRoute.POST(webhookRequest(paidEvent("evt_paid_4", order.id, order.stripe_session_id, 490)) as never);
    await webhookRoute.POST(
      webhookRequest({
        id: "evt_charge_no_meta",
        object: "event",
        type: "charge.succeeded",
        // No metadata at all - only the payment intent ties it back to the order.
        data: { object: { id: "ch_2", object: "charge", payment_intent: `pi_${order.id}` } },
      }) as never,
    );
    await flushAfter();

    const fee = await pool.query("SELECT amount_minor FROM vatproof.ledger_entries WHERE kind = 'stripe_fee'");
    expect(fee.rows[0]).toMatchObject({ amount_minor: -32 });
  });

  it("refuses to deliver anything for an order that was never paid", async () => {
    const { body } = await placeOrder(["SE556036079301"], "203.0.113.22", "unpaid-key");
    const token = String(body.orderToken);

    const csvRes = await csvRoute.GET(new Request("https://vatproof.test") as never, { params: Promise.resolve({ token }) });
    expect(csvRes.status).toBe(409);

    const pdfRes = await pdfRoute.GET(new Request("https://vatproof.test") as never, { params: Promise.resolve({ token }) });
    expect(pdfRes.status).toBe(409);
  });

  it("turns a database outage into a clean 503, never a stack trace", async () => {
    const broken = {
      query: async () => {
        throw new Error("connection refused");
      },
      connect: async () => {
        throw new Error("connection refused");
      },
    } as unknown as import("@/lib/db").PoolLike;
    db.setPoolForTesting(broken);
    try {
      const res = await ordersRoute.POST(
        orderRequest(
          { requesterVat: "SE556036079301", vatNumbers: ["SE556036079301"], idempotencyKey: "outage-key-1" },
          "203.0.113.30",
        ) as never,
      );
      expect(res.status).toBe(503);
      expect((await res.json()) as Record<string, unknown>).toMatchObject({ error: "service_unavailable" });

      const status = await statusRoute.GET(new Request("https://vatproof.test") as never, {
        params: Promise.resolve({ token: "anything" }),
      });
      expect(status.status).toBe(503);
    } finally {
      db.setPoolForTesting(pool as unknown as import("@/lib/db").PoolLike);
    }
  });

  it("returns 404 for an unknown order token", async () => {
    const res = await statusRoute.GET(new Request("https://vatproof.test") as never, {
      params: Promise.resolve({ token: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  it("keeps backfilling fees when one order's payment intent is unresolvable", async () => {
    // After a Stripe account switch, orders taken by the old account can never
    // have their fee fetched. findOrdersMissingFee returns oldest first, so
    // that orphan sits at the head of the list on every sweep - if one failure
    // aborted the loop, no later order would ever get its cost booked and the
    // ledger would overstate margin forever.
    const older = await placeOrder(["SE556036079301"], "203.0.113.41", "orphan-fee-key");
    const orderA = (await pool.query<{ id: string; stripe_session_id: string }>(
      "SELECT id, stripe_session_id FROM vatproof.orders WHERE public_token = $1",
      [String(older.body.orderToken)],
    )).rows[0]!;
    unresolvableIntents.add(`pi_${orderA.id}`);
    await webhookRoute.POST(webhookRequest(paidEvent("evt_orphan", orderA.id, orderA.stripe_session_id, 490)) as never);

    const newer = await placeOrder(["IT00743110157"], "203.0.113.42", "healthy-fee-key");
    const orderB = (await pool.query<{ id: string; stripe_session_id: string }>(
      "SELECT id, stripe_session_id FROM vatproof.orders WHERE public_token = $1",
      [String(newer.body.orderToken)],
    )).rows[0]!;
    await webhookRoute.POST(webhookRequest(paidEvent("evt_healthy", orderB.id, orderB.stripe_session_id, 490)) as never);
    afterQueue.length = 0;

    // Both are old enough for the fee sweep to chase them.
    await pool.query("UPDATE vatproof.orders SET paid_at = now() - interval '1 hour'");

    const res = await cronRoute.GET(
      new Request("https://vatproof.test/api/cron/reconcile", {
        headers: { authorization: "Bearer cron-secret-0123456789" },
      }) as never,
    );
    expect(res.status).toBe(200);

    const feeA = await pool.query("SELECT 1 FROM vatproof.ledger_entries WHERE order_id = $1 AND kind = 'stripe_fee'", [orderA.id]);
    const feeB = await pool.query<{ amount_minor: number }>(
      "SELECT amount_minor FROM vatproof.ledger_entries WHERE order_id = $1 AND kind = 'stripe_fee'",
      [orderB.id],
    );
    // The orphan stays unbooked - inventing a zero would falsify the ledger.
    expect(feeA.rowCount).toBe(0);
    // The healthy order behind it still gets its true cost.
    expect(feeB.rows[0]).toMatchObject({ amount_minor: -32 });
  });

  function checkRequest(vatNumber: unknown, ip = "203.0.113.90"): Request {
    return new Request("https://vatproof.test/api/check", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ vatNumber }),
    });
  }

  it("answers a free check without a consultation number, and takes no money", async () => {
    // The free check is the front door: it must give a real answer, state
    // plainly that the answer is not evidence, and create no order.
    const res = await checkRoute.POST(checkRequest("DE811907980", "203.0.113.91") as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ vatNumber: "DE811907980", valid: true, consultationNumber: null });

    expect((await pool.query("SELECT * FROM vatproof.orders")).rowCount).toBe(0);
    expect((await pool.query("SELECT * FROM vatproof.ledger_entries")).rowCount).toBe(0);
  });

  it("refuses a malformed number without spending a VIES call", async () => {
    const res = await checkRoute.POST(checkRequest("nonsense", "203.0.113.92") as never);
    expect(res.status).toBe(400);
  });

  it("caps the free check so it cannot be used as the paid batch", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 9; i++) {
      const res = await checkRoute.POST(checkRequest("DE811907980", "203.0.113.93") as never);
      codes.push(res.status);
    }
    expect(codes.filter((c) => c === 200).length).toBeGreaterThan(0);
    expect(codes).toContain(429);
  });

  it("hands a previous list back so the same customer can re-run it", async () => {
    // Repeat purchase is the only growth channel a product with no account has:
    // the list must come back without the customer rebuilding it.
    const { body } = await placeOrder(["IT00743110157", "SE556036079301", "FR40303265045"], "203.0.113.31", "relist-key");
    const token = String(body.orderToken);

    const res = await listRoute.GET(new Request("https://vatproof.test") as never, {
      params: Promise.resolve({ token }),
    });
    expect(res.status).toBe(200);

    const list = (await res.json()) as { requesterVat: string; vatNumbers: string[]; itemCount: number };
    // Order is the customer's original row order, not whatever the database returns.
    expect(list.vatNumbers).toEqual(["IT00743110157", "SE556036079301", "FR40303265045"]);
    expect(list.requesterVat).toBe("SE556036079301");
    expect(list.itemCount).toBe(3);
  });

  it("returns 404 rather than an empty list for an unknown token", async () => {
    const res = await listRoute.GET(new Request("https://vatproof.test") as never, {
      params: Promise.resolve({ token: "no-such-order" }),
    });
    expect(res.status).toBe(404);
  });

  it("refuses to hand back a list that data retention has already erased", async () => {
    const { body } = await placeOrder(["IT00743110157"], "203.0.113.32", "relist-purged-key");
    const token = String(body.orderToken);
    await pool.query(
      `UPDATE vatproof.orders SET purged_at = now(), requester_vat = '(purged)' WHERE public_token = $1`,
      [token],
    );
    await pool.query(
      `UPDATE vatproof.order_items SET vat_number = '(purged)'
       WHERE order_id = (SELECT id FROM vatproof.orders WHERE public_token = $1)`,
      [token],
    );

    const res = await listRoute.GET(new Request("https://vatproof.test") as never, {
      params: Promise.resolve({ token }),
    });
    expect(res.status).toBe(410);
    expect(await res.text()).not.toContain("(purged)");
  });

  it("guards the cron endpoint and completes work the webhook never finished", async () => {
    const { body } = await placeOrder(["SE556036079301", "IT00743110157"], "203.0.113.23", "cron-key");
    const token = String(body.orderToken);
    const order = (await pool.query<{ id: string; stripe_session_id: string }>("SELECT id, stripe_session_id FROM vatproof.orders")).rows[0]!;

    await webhookRoute.POST(webhookRequest(paidEvent("evt_paid_3", order.id, order.stripe_session_id, 490)) as never);
    afterQueue.length = 0; // simulate the background pass never running

    const unauthorized = await cronRoute.GET(new Request("https://vatproof.test/api/cron/reconcile") as never);
    expect(unauthorized.status).toBe(401);

    const authorized = await cronRoute.GET(
      new Request("https://vatproof.test/api/cron/reconcile", {
        headers: { authorization: "Bearer cron-secret-0123456789" },
      }) as never,
    );
    expect(authorized.status).toBe(200);
    expect((await authorized.json()) as Record<string, unknown>).toMatchObject({ ok: true, completed: 1 });

    const statusRes = await statusRoute.GET(new Request("https://vatproof.test") as never, {
      params: Promise.resolve({ token }),
    });
    expect((await statusRes.json()) as Record<string, unknown>).toMatchObject({ status: "fulfilled", done: true });
  });

  it("expires an abandoned checkout when Stripe says the session lapsed", async () => {
    await placeOrder(["SE556036079301"], "203.0.113.24", "expire-key");
    const order = (await pool.query<{ stripe_session_id: string }>("SELECT stripe_session_id FROM vatproof.orders")).rows[0]!;

    const res = await webhookRoute.POST(
      webhookRequest({
        id: "evt_expired",
        object: "event",
        type: "checkout.session.expired",
        data: { object: { id: order.stripe_session_id, object: "checkout.session" } },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect((await pool.query("SELECT status FROM vatproof.orders")).rows[0]).toMatchObject({ status: "expired" });
  });
});
