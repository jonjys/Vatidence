import { guard, json } from "@/lib/http";
import { store } from "@/lib/store-pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The VAT numbers an order was placed for, so the same list can be run again
 * without retyping it.
 *
 * VAT registration is not a permanent fact: a number that was valid last
 * quarter can be deregistered this one, and the consultation number only
 * evidences the day it was issued. Re-checking the same list is therefore the
 * normal case, not an edge case - and the customer who has to rebuild the list
 * by hand every quarter is the customer who does not come back.
 *
 * The order token already unlocks the full evidence pack, which contains these
 * numbers plus the registered names behind them, so this exposes nothing the
 * holder of the token could not already download.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return guard("GET /api/orders/[token]/list", () => list(ctx));
}

async function list(ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const order = await store.getOrderByToken(token);
  if (!order) return json({ error: "not_found" }, 404);

  if (order.purgedAt !== null) {
    return json(
      { error: "purged", message: "This order is past its retention window and its list has been erased." },
      410,
    );
  }

  const items = await store.listItems(order.id);
  const vatNumbers = [...items]
    .sort((a, b) => a.position - b.position)
    .map((i) => `${i.countryCode}${i.vatNumber}`);

  return json(
    {
      requesterVat: `${order.requesterCountry}${order.requesterVat}`,
      vatNumbers,
      itemCount: vatNumbers.length,
    },
    200,
    { "cache-control": "private, no-store" },
  );
}
