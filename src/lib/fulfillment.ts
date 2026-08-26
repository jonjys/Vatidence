import { mapWithConcurrency } from "@/lib/concurrency";
import { log, redactVat, errorMessage } from "@/lib/log";
import { refundForFailedRows } from "@/lib/pricing";
import type { RefundGateway } from "@/lib/refunds";
import { isFulfillable, outcomeFor, type OrderStatus } from "@/lib/state";
import type { OrderStore } from "@/lib/store";
import type { Order } from "@/lib/types";
import { backoffMs, type ViesClient } from "@/lib/vies";

export type FulfillmentDeps = {
  store: OrderStore;
  vies: ViesClient;
  refunds: RefundGateway;
  now?: () => Date;
  /** Wall-clock budget for a single pass, so we return before the function times out. */
  budgetMs?: number;
  maxAttempts?: number;
  concurrency?: number;
  /** Backoff schedule; overridable so tests are instant and deterministic. */
  backoff?: (attempt: number) => number;
};

export type FulfillmentOutcome =
  | { kind: "skipped"; reason: "not_payable" | "locked" | "terminal" }
  | {
      kind: "ran";
      processed: number;
      answered: number;
      failed: number;
      remaining: number;
      status: OrderStatus;
      refundedMinor: number;
    };

const DEFAULT_BUDGET_MS = 45_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_CONCURRENCY = 4;
const LOCK_HEADROOM_MS = 30_000;
/** How soon to look again when rows are merely waiting out their backoff. */
const RESUME_FLOOR_MS = 15_000;

/**
 * One fulfillment pass over one paid order.
 *
 * Properties this function is built to guarantee:
 *  - it never runs against an unpaid order;
 *  - concurrent passes cannot overlap (row-level lease on the order);
 *  - every row is persisted the moment it resolves, so a pass can die at any
 *    point and the next pass resumes exactly where it stopped;
 *  - a row that will never resolve is dead-lettered and its money refunded;
 *  - a refund failure aborts finalisation rather than losing the obligation.
 */
export async function runFulfillment(order: Order, deps: FulfillmentDeps): Promise<FulfillmentOutcome> {
  const now = deps.now ?? (() => new Date());
  const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
  const backoff = deps.backoff ?? backoffMs;
  const { store, vies, refunds } = deps;

  if (!isFulfillable(order.status)) {
    return { kind: "skipped", reason: order.status === "awaiting_payment" ? "not_payable" : "terminal" };
  }

  const locked = await store.acquireFulfillmentLock(order.id, budgetMs + LOCK_HEADROOM_MS);
  if (!locked) return { kind: "skipped", reason: "locked" };

  const startedAt = now().getTime();
  let processed = 0;
  let answered = 0;
  let failed = 0;

  try {
    // `paid -> processing` marks that upstream work has begun. Re-entrant.
    if (order.status === "paid") {
      await store.transition(order.id, ["paid"], "processing");
    }

    for (;;) {
      if (now().getTime() - startedAt >= budgetMs) break;
      const batch = await store.claimDueItems(order.id, concurrency * 5);
      if (batch.length === 0) break;

      const results = await mapWithConcurrency(batch, concurrency, async (item) => {
        const result = await vies.check({
          countryCode: item.countryCode,
          vatNumber: item.vatNumber,
          requesterCountryCode: order.requesterCountry,
          requesterNumber: order.requesterVat,
        });

        if (result.kind === "answer") {
          await store.applyResolution(item.id, {
            kind: "answered",
            valid: result.valid,
            requestIdentifier: result.requestIdentifier,
            requestDate: result.requestDate,
            name: result.name,
            address: result.address,
          });
          return "answered" as const;
        }

        const nextAttemptNumber = item.attempts + 1;
        const giveUp = !result.retryable || nextAttemptNumber >= maxAttempts;

        if (giveUp) {
          await store.applyResolution(item.id, {
            kind: "failed",
            error: `${result.code}: ${result.message}`,
          });
          log.warn("item.dead_letter", {
            orderId: order.id,
            vat: redactVat(item.countryCode, item.vatNumber),
            code: result.code,
            attempts: nextAttemptNumber,
          });
          return "failed" as const;
        }

        await store.applyResolution(item.id, {
          kind: "retry",
          error: `${result.code}: ${result.message}`,
          nextAttemptAt: new Date(now().getTime() + backoff(nextAttemptNumber)),
        });
        return "retry" as const;
      });

      processed += results.length;
      answered += results.filter((r) => r === "answered").length;
      failed += results.filter((r) => r === "failed").length;
    }

    const counts = await store.countItems(order.id);

    if (counts.pending > 0) {
      // Work remains: schedule the next pass and stay in `processing`.
      const pendingItems = await store.claimDueItems(order.id, 1);
      const resumeAt =
        pendingItems.length > 0
          ? now()
          : new Date(now().getTime() + RESUME_FLOOR_MS);
      await store.bumpOrderAttempt(order.id, resumeAt, null);
      log.info("fulfillment.partial", {
        orderId: order.id,
        processed,
        answered,
        failed,
        remaining: counts.pending,
      });
      return {
        kind: "ran",
        processed,
        answered,
        failed,
        remaining: counts.pending,
        status: "processing",
        refundedMinor: 0,
      };
    }

    // Every row is terminal - decide the outcome and settle the money.
    const outcome = outcomeFor(counts.total, counts.failed);
    let refundedMinor = 0;

    if (outcome.refundRows > 0) {
      const amount = refundForFailedRows({
        amountTotalMinor: order.amountTotal,
        amountRefundedMinor: order.amountRefunded,
        totalRows: counts.total,
        failedRows: outcome.refundRows,
      });

      if (amount > 0) {
        if (!order.stripePaymentIntentId) {
          throw new Error("cannot refund: order has no payment intent recorded");
        }
        // Idempotency key is derived from the order, so a retried pass reuses
        // the same Stripe refund instead of creating a second one.
        const refund = await refunds.refund({
          paymentIntentId: order.stripePaymentIntentId,
          amountMinor: amount,
          idempotencyKey: `vatproof-refund-${order.id}-auto`,
          reason: `${outcome.refundRows} of ${counts.total} rows could not be verified upstream`,
        });
        const recorded = await store.recordRefund(order.id, amount, refund.id);
        if (recorded) refundedMinor = amount;
        await store.markItemsRefunded(order.id);
        log.info("fulfillment.refund", {
          orderId: order.id,
          amountMinor: amount,
          refundId: refund.id,
          rows: outcome.refundRows,
          alreadyRecorded: !recorded,
        });
      }
    }

    await store.transition(order.id, ["processing"], outcome.status);
    await store.bumpOrderAttempt(order.id, null, null);
    log.info("fulfillment.complete", {
      orderId: order.id,
      status: outcome.status,
      answered: counts.valid + counts.invalid,
      failed: counts.failed,
      refundedMinor,
    });

    return {
      kind: "ran",
      processed,
      answered,
      failed,
      remaining: 0,
      status: outcome.status,
      refundedMinor,
    };
  } catch (e) {
    // Anything unexpected (including a failed refund) leaves the order in
    // `processing` with a scheduled retry. Money is never silently stranded.
    const message = errorMessage(e);
    await store.bumpOrderAttempt(order.id, new Date(now().getTime() + backoff(order.attempts + 1)), message);
    log.error("fulfillment.error", { orderId: order.id, error: message });
    throw e;
  } finally {
    await store.releaseFulfillmentLock(order.id);
  }
}
