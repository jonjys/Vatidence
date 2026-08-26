import { env } from "@/lib/env";
import { runFulfillment, type FulfillmentOutcome } from "@/lib/fulfillment";
import { errorMessage, log } from "@/lib/log";
import { store } from "@/lib/store-pg";
import { stripeRefunds } from "@/lib/stripe";
import type { Order } from "@/lib/types";
import { HttpViesClient } from "@/lib/vies";

/**
 * Fulfillment has three independent triggers - the Stripe webhook, the
 * customer's own result page polling, and the cron sweep - all funnelled
 * through here. The order-level lease makes overlap harmless, so no trigger
 * needs to know about the others.
 */
export async function kickFulfillment(order: Order, budgetMs?: number): Promise<FulfillmentOutcome | null> {
  const config = env();
  try {
    return await runFulfillment(order, {
      store,
      vies: new HttpViesClient(config.VIES_BASE_URL, config.VIES_TIMEOUT_MS),
      refunds: stripeRefunds,
      budgetMs: budgetMs ?? config.RUN_BUDGET_MS,
      maxAttempts: config.MAX_ITEM_ATTEMPTS,
      concurrency: config.VIES_MAX_CONCURRENCY,
    });
  } catch (e) {
    // runFulfillment already persisted the retry schedule; never bubble a
    // fulfillment error into a customer-facing response.
    log.error("kick.failed", { orderId: order.id, error: errorMessage(e) });
    return null;
  }
}
