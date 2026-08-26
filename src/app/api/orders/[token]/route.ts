import { after, type NextRequest } from "next/server";
import { guard, json } from "@/lib/http";
import { kickFulfillment } from "@/lib/kick";
import { formatMinor } from "@/lib/pricing";
import { isTerminal, isFulfillable } from "@/lib/state";
import { store } from "@/lib/store-pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Status endpoint for the result page. It doubles as a fulfillment trigger:
 * the customer watching their own progress bar is what drives most orders to
 * completion, with the Stripe webhook and the cron sweep as backstops.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  return guard("GET /api/orders/[token]", () => status(ctx));
}

async function status(ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const order = await store.getOrderByToken(token);
  if (!order) {
    return json({ error: "not_found" }, 404);
  }

  const counts = await store.countItems(order.id);

  if (isFulfillable(order.status)) {
    after(async () => {
      await kickFulfillment(order);
    });
  }

  const answered = counts.valid + counts.invalid;
  const done = isTerminal(order.status);

  return json({
      status: order.status,
      done,
      purged: order.purgedAt !== null,
      counts: {
        total: counts.total,
        answered,
        valid: counts.valid,
        invalid: counts.invalid,
        unverifiable: counts.failed,
        pending: counts.pending,
      },
      progress: counts.total === 0 ? 0 : Math.round(((counts.total - counts.pending) / counts.total) * 100),
      money: {
        currency: order.currency,
        amountTotalMinor: order.amountTotal,
        amountRefundedMinor: order.amountRefunded,
        amountTotal: formatMinor(order.amountTotal, order.currency),
        amountRefunded: formatMinor(order.amountRefunded, order.currency),
      },
      downloadsReady: done && order.status !== "expired" && order.purgedAt === null,
      retrievableUntil: order.purgeAfter.toISOString(),
  });
}
