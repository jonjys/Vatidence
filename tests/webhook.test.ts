import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { MemoryOrderStore } from "@/lib/testing/memory-store";
import { seedPaidOrder } from "./helpers";

const SECRET = "whsec_test_secret_for_unit_tests";
// Webhook signature verification is offline maths; no API key is exercised.
const stripe = new Stripe("sk_test_dummy_key_for_unit_tests", { apiVersion: "2025-08-27.basil" });

function signedPayload(body: unknown, opts: { secret?: string; timestamp?: number } = {}) {
  const payload = JSON.stringify(body);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
  });
  return { payload, header };
}

const EVENT = {
  id: "evt_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", amount_total: 490 } },
};

describe("stripe webhook signature verification", () => {
  it("accepts a correctly signed payload", () => {
    const { payload, header } = signedPayload(EVENT);
    const event = stripe.webhooks.constructEvent(payload, header, SECRET);
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a payload whose amount was tampered with after signing", () => {
    const { payload, header } = signedPayload(EVENT);
    const tampered = payload.replace('"amount_total":490', '"amount_total":1');
    expect(() => stripe.webhooks.constructEvent(tampered, header, SECRET)).toThrow();
  });

  it("rejects a payload signed with a different secret", () => {
    const { payload, header } = signedPayload(EVENT, { secret: "whsec_someone_elses_secret" });
    expect(() => stripe.webhooks.constructEvent(payload, header, SECRET)).toThrow();
  });

  it("rejects a replayed signature that is outside the tolerance window", () => {
    const { payload, header } = signedPayload(EVENT, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => stripe.webhooks.constructEvent(payload, header, SECRET, 300)).toThrow();
  });

  it("rejects a missing signature header", () => {
    const { payload } = signedPayload(EVENT);
    expect(() => stripe.webhooks.constructEvent(payload, "", SECRET)).toThrow();
  });
});

describe("webhook event idempotency", () => {
  it("claims each Stripe event id exactly once", async () => {
    const store = new MemoryOrderStore();
    expect(await store.beginWebhookEvent("evt_1", "checkout.session.completed")).toBe(true);
    expect(await store.beginWebhookEvent("evt_1", "checkout.session.completed")).toBe(false);
    expect(await store.beginWebhookEvent("evt_2", "charge.succeeded")).toBe(true);
  });
});

describe("payment capture invariants", () => {
  it("recognises payment once, no matter how many times Stripe delivers the event", async () => {
    const store = new MemoryOrderStore();
    await store.createOrder(
      {
        id: "o1",
        publicToken: "tok",
        requesterCountry: "SE",
        requesterVat: "556036079301",
        itemCount: 1,
        amountTotal: 490,
        currency: "eur",
        purgeAfter: new Date("2099-01-01T00:00:00Z"),
        clientIpHash: null,
      },
      [{ id: "i1", position: 1, countryCode: "SE", vatNumber: "556036079301" }],
    );

    const facts = { paymentIntentId: "pi_1", chargeId: "ch_1", amountTotalMinor: 490, currency: "eur" };
    expect(await store.markPaid("o1", facts)).toBe(true);
    expect(await store.markPaid("o1", facts)).toBe(false);
    expect((await store.getOrderById("o1"))?.status).toBe("paid");
  });

  it("books the charge once even if the ledger write is replayed", async () => {
    const store = new MemoryOrderStore();
    const order = await seedPaidOrder(store, { vats: ["SE556036079301"], amountTotal: 490 });
    await store.recordLedger({
      orderId: order.id,
      kind: "charge",
      amountMinor: 490,
      currency: "eur",
      reference: "pi_order-1",
      memo: "replay",
    });
    expect(store.ledger.filter((e) => e.kind === "charge")).toHaveLength(1);
  });

  it("records the Stripe fee as the only cost of goods sold, giving true margin", async () => {
    const store = new MemoryOrderStore();
    const order = await seedPaidOrder(store, { vats: ["SE556036079301"], amountTotal: 490 });
    await store.recordLedger({
      orderId: order.id,
      kind: "stripe_fee",
      amountMinor: -32,
      currency: "eur",
      reference: "ch_order-1",
      memo: "Stripe fee",
    });
    // Upstream (VIES) is free, so margin is revenue minus the processing fee.
    expect(store.marginFor(order.id)).toBe(490 - 32);
  });
});
