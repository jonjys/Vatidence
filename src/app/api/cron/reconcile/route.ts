import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { kickFulfillment } from "@/lib/kick";
import { errorMessage, log } from "@/lib/log";
import { pruneRateLimits } from "@/lib/ratelimit";
import { store } from "@/lib/store-pg";
import { feeMemo, fetchFeeForPaymentIntent, isPermanentlyUnresolvable } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ORDERS_PER_SWEEP = 25;
const CHECKOUT_TTL_MS = 2 * 60 * 60 * 1000;
/** How long an unpaid, expired order is kept before its rows are removed. */
const EXPIRED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Grace period before chasing a fee, so Stripe has settled the balance transaction. */
const FEE_SETTLE_MS = 5 * 60 * 1000;

/**
 * Recovery sweep. Nothing here is on the happy path - it exists so that a
 * dropped webhook, a closed browser tab or a multi-hour member-state outage
 * still ends in a deterministic, settled order.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const config = env();
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${config.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const budgetMs = 50_000;
  const summary = { expired: 0, deleted: 0, resumed: 0, completed: 0, fees: 0, purged: 0, errors: 0 };

  try {
    summary.expired = await store.expireStaleOrders(new Date(Date.now() - CHECKOUT_TTL_MS), 200);
    // Storage is finite and shared; unpaid orders are pure residue.
    summary.deleted = await store.deleteExpiredOrders(new Date(Date.now() - EXPIRED_RETENTION_MS), 1000);
  } catch (e) {
    summary.errors++;
    log.error("cron.expire_failed", { error: errorMessage(e) });
  }

  try {
    const due = await store.findDueOrders(MAX_ORDERS_PER_SWEEP);
    for (const order of due) {
      if (Date.now() - startedAt > budgetMs) break;
      const remaining = budgetMs - (Date.now() - startedAt);
      const outcome = await kickFulfillment(order, Math.min(config.RUN_BUDGET_MS, Math.max(5_000, remaining)));
      if (outcome?.kind === "ran") {
        summary.resumed++;
        if (outcome.remaining === 0) summary.completed++;
      }
    }
  } catch (e) {
    summary.errors++;
    log.error("cron.sweep_failed", { error: errorMessage(e) });
  }

  try {
    // The fee webhook races payment capture, and Stripe creates the balance
    // transaction asynchronously. Either way the ledger would silently record
    // revenue without its cost, so unbooked fees are swept up here.
    const missing = await store.findOrdersMissingFee(new Date(Date.now() - FEE_SETTLE_MS), 50);
    for (const order of missing) {
      if (!order.stripePaymentIntentId) continue;
      // Per order, not per sweep. The list is ordered oldest first, so a single
      // unfetchable payment intent at the head would otherwise abort the
      // backfill on every run forever - and the ledger would silently keep
      // recording revenue with no cost against it.
      try {
        const fee = await fetchFeeForPaymentIntent(order.stripePaymentIntentId);
        if (!fee) continue;
        await store.recordLedger({
          orderId: order.id,
          kind: "stripe_fee",
          amountMinor: -fee.feeMinor,
          currency: fee.currency,
          reference: fee.chargeId,
          memo: feeMemo(fee),
        });
        summary.fees++;
        log.info("ledger.fee_backfilled", { orderId: order.id, feeMinor: fee.feeMinor, currency: fee.currency });
      } catch (e) {
        summary.errors++;
        if (isPermanentlyUnresolvable(e)) {
          // Almost always an order taken by a Stripe account this deployment no
          // longer holds the keys for. Its fee has to be booked by hand.
          log.warn("ledger.fee_unresolvable", {
            orderId: order.id,
            paymentIntentId: order.stripePaymentIntentId,
          });
        } else {
          log.error("cron.fee_backfill_failed", { orderId: order.id, error: errorMessage(e) });
        }
      }
    }
  } catch (e) {
    summary.errors++;
    log.error("cron.fee_backfill_failed", { error: errorMessage(e) });
  }

  try {
    // GDPR retention: results stop being retrievable once the window closes.
    summary.purged = await store.purgeExpired(new Date(), 500);
    await pruneRateLimits(new Date(Date.now() - 24 * 60 * 60 * 1000));
  } catch (e) {
    summary.errors++;
    log.error("cron.purge_failed", { error: errorMessage(e) });
  }

  log.info("cron.sweep", { ...summary, durationMs: Date.now() - startedAt });
  return Response.json({ ok: summary.errors === 0, ...summary }, { headers: { "cache-control": "no-store" } });
}
