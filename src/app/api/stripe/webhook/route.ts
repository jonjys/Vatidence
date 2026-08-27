import Stripe from "stripe";
import { after, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { kickFulfillment } from "@/lib/kick";
import { errorMessage, log } from "@/lib/log";
import { store } from "@/lib/store-pg";
import { feeMemo, fetchChargeFee, stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "charge.succeeded",
  "charge.refunded",
]);

/**
 * The only place money is recognised. Three properties matter here:
 *   1. nothing is trusted without a verified Stripe signature;
 *   2. every event id is claimed exactly once, so replays are free;
 *   3. the response is fast - fulfillment happens after the 200.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, env().STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    log.warn("webhook.bad_signature", { error: errorMessage(e) });
    return new Response("invalid signature", { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }

  let fresh: boolean;
  try {
    fresh = await store.beginWebhookEvent(event.id, event.type);
  } catch (e) {
    // The database is unreachable; a 500 makes Stripe redeliver later.
    log.error("webhook.claim_failed", { eventId: event.id, error: errorMessage(e) });
    return new Response("storage unavailable", { status: 500 });
  }
  if (!fresh) {
    log.info("webhook.duplicate", { eventId: event.id, type: event.type });
    return Response.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
    await store.finishWebhookEvent(event.id, null);
  } catch (e) {
    const message = errorMessage(e);
    await store.finishWebhookEvent(event.id, message);
    log.error("webhook.failed", { eventId: event.id, type: event.type, error: message });
    // 500 makes Stripe retry with backoff; the event row records the failure.
    return new Response("processing failed", { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        log.info("webhook.session_not_paid", { sessionId: session.id, status: session.payment_status });
        return;
      }
      await capturePayment(session);
      return;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const order = await store.getOrderBySessionId(session.id);
      if (!order) return;
      await store.transition(order.id, ["awaiting_payment"], "expired");
      log.info("order.expired", { orderId: order.id });
      return;
    }

    case "charge.succeeded": {
      const charge = event.data.object as Stripe.Charge;
      const order = await orderForCharge(charge);
      if (!order) return;
      const fee = await fetchChargeFee(charge.id);
      if (!fee) return;
      // Stripe's fee is the only cost of goods sold in this business.
      await store.recordLedger({
        orderId: order.id,
        kind: "stripe_fee",
        amountMinor: -fee.feeMinor,
        currency: fee.currency,
        reference: charge.id,
        memo: feeMemo(fee),
      });
      log.info("ledger.fee", { orderId: order.id, feeMinor: fee.feeMinor, currency: fee.currency });
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const order = await orderForCharge(charge);
      if (!order) return;
      // Reconcile refunds issued outside the automatic path (e.g. by hand in
      // the Stripe dashboard) so the ledger and the order agree.
      const delta = charge.amount_refunded - order.amountRefunded;
      if (delta > 0) {
        await store.recordRefund(order.id, delta, `charge-reconcile-${charge.id}-${charge.amount_refunded}`);
      }
      if (charge.amount_refunded >= charge.amount && order.status !== "refunded") {
        const from = (["paid", "processing", "fulfilled", "partially_refunded"] as const).filter(
          (s) => s === order.status,
        );
        if (from.length > 0) await store.transition(order.id, [...from], "refunded");
      }
      log.info("ledger.refund_reconciled", { orderId: order.id, amountRefunded: charge.amount_refunded });
      return;
    }

    default:
      return;
  }
}

/**
 * Charges reach us by metadata when Stripe copies it from the PaymentIntent,
 * and by payment intent id when it does not. Both are checked so the ledger
 * never misses a fee or a refund.
 */
async function orderForCharge(charge: Stripe.Charge) {
  const orderId = charge.metadata?.order_id;
  if (orderId) {
    const byId = await store.getOrderById(orderId);
    if (byId) return byId;
  }
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return null;
  return store.getOrderByPaymentIntent(paymentIntentId);
}

async function capturePayment(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id;
  const order = orderId ? await store.getOrderById(orderId) : await store.getOrderBySessionId(session.id);
  if (!order) {
    log.warn("webhook.unknown_order", { sessionId: session.id });
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  const chargeId =
    typeof session.payment_intent === "object" && session.payment_intent
      ? typeof session.payment_intent.latest_charge === "string"
        ? session.payment_intent.latest_charge
        : (session.payment_intent.latest_charge?.id ?? null)
      : null;

  const received = session.amount_total ?? order.amountTotal;
  if (received !== order.amountTotal) {
    log.warn("payment.amount_mismatch", { orderId: order.id, expected: order.amountTotal, received });
  }

  const transitioned = await store.markPaid(order.id, {
    paymentIntentId,
    chargeId,
    amountTotalMinor: received,
    currency: session.currency ?? order.currency,
  });

  if (transitioned) {
    await store.recordLedger({
      orderId: order.id,
      kind: "charge",
      amountMinor: received,
      currency: session.currency ?? order.currency,
      reference: paymentIntentId ?? session.id,
      memo: `Payment for ${order.itemCount} VIES verifications`,
    });
    log.info("order.paid", { orderId: order.id, amountMinor: received });
  }

  // Start fulfilling immediately, but only after Stripe has its 200.
  const refreshed = await store.getOrderById(order.id);
  if (refreshed) {
    after(async () => {
      await kickFulfillment(refreshed);
    });
  }
}
