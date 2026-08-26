import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { hashIp, newId, publicToken, sha256Hex } from "@/lib/ids";
import { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { errorMessage, log } from "@/lib/log";
import { CURRENCY, quote } from "@/lib/pricing";
import { rateLimit } from "@/lib/ratelimit";
import { store } from "@/lib/store-pg";
import { createCheckoutSession } from "@/lib/stripe";
import type { NewOrderItem } from "@/lib/types";
import { parseVat } from "@/lib/vat";
import { guard, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  requesterVat: z.string().min(3).max(24),
  vatNumbers: z.array(z.string().min(3).max(32)).min(1),
  idempotencyKey: z.string().min(8).max(120),
});

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: NextRequest): Promise<Response> {
  return guard("POST /api/orders", () => createOrder(req));
}

async function createOrder(req: NextRequest): Promise<Response> {
  const config = env();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json", message: "Request body must be JSON." }, 400);
  }

  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return json({ error: "invalid_request", message: parsedBody.error.issues[0]?.message ?? "Invalid request." }, 400);
  }
  const body = parsedBody.data;

  if (body.vatNumbers.length > config.MAX_ITEMS_PER_ORDER) {
    return json(
      { error: "too_many_rows", message: `A single order accepts at most ${config.MAX_ITEMS_PER_ORDER} VAT numbers.` },
      400,
    );
  }

  // Rate limit before doing anything that costs us money or upstream goodwill.
  const ipHash = hashIp(clientIp(req), config.CRON_SECRET) ?? "anonymous";
  const perMinute = await rateLimit(`orders:min:${ipHash}`, config.RATE_LIMIT_PER_MINUTE, 60_000);
  const perHour = await rateLimit(`orders:hour:${ipHash}`, config.RATE_LIMIT_PER_HOUR, 3_600_000);
  if (!perMinute.allowed || !perHour.allowed) {
    const resetAt = !perMinute.allowed ? perMinute.resetAt : perHour.resetAt;
    return json({ error: "rate_limited", message: "Too many orders from this address. Try again shortly.", resetAt }, 429);
  }

  // Requester VAT is mandatory: without it VIES issues no consultation number,
  // and the consultation number is the entire product.
  const requester = parseVat(body.requesterVat);
  if (!requester.ok) {
    return json({ error: "invalid_requester_vat", message: `Your own VAT number ${requester.reason}.` }, 400);
  }

  const items: NewOrderItem[] = [];
  const seen = new Set<string>();
  for (const value of body.vatNumbers) {
    const parsed = parseVat(value);
    if (!parsed.ok) {
      return json({ error: "invalid_vat_number", message: `"${value}" ${parsed.reason}.`, value }, 400);
    }
    if (seen.has(parsed.value.canonical)) continue;
    seen.add(parsed.value.canonical);
    items.push({
      id: newId(),
      position: items.length + 1,
      countryCode: parsed.value.countryCode,
      vatNumber: parsed.value.vatNumber,
    });
  }

  if (items.length === 0) {
    return json({ error: "no_rows", message: "No usable VAT numbers in the request." }, 400);
  }

  const requestHash = sha256Hex(JSON.stringify({ r: requester.value.canonical, n: [...seen].sort() }));
  const claim = await claimIdempotencyKey(body.idempotencyKey, requestHash);
  if (!claim.claimed) {
    if (claim.existing.requestHash !== requestHash) {
      return json({ error: "idempotency_conflict", message: "This idempotency key was used for a different order." }, 409);
    }
    if (claim.existing.response) return json(claim.existing.response, 200);
    return json({ error: "in_progress", message: "This order is still being created. Retry in a moment." }, 409);
  }

  const priced = quote(items.length);
  const orderId = newId();
  const token = publicToken();

  try {
    await store.createOrder(
      {
        id: orderId,
        publicToken: token,
        requesterCountry: requester.value.countryCode,
        requesterVat: requester.value.vatNumber,
        itemCount: items.length,
        amountTotal: priced.totalMinor,
        currency: CURRENCY,
        purgeAfter: new Date(Date.now() + config.DATA_RETENTION_DAYS * 86_400_000),
        clientIpHash: ipHash === "anonymous" ? null : ipHash,
      },
      items,
    );

    const session = await createCheckoutSession({
      orderId,
      publicToken: token,
      itemCount: items.length,
      amountMinor: priced.totalMinor,
      currency: CURRENCY,
      idempotencyKey: `vatproof-checkout-${orderId}`,
    });

    if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
    await store.attachCheckoutSession(orderId, session.id);

    const response = {
      orderToken: token,
      checkoutUrl: session.url,
      resultUrl: `${config.APP_URL}/r/${token}`,
      itemCount: items.length,
      amountMinor: priced.totalMinor,
      currency: CURRENCY,
    };
    await completeIdempotencyKey(body.idempotencyKey, orderId, response);

    log.info("order.created", { orderId, itemCount: items.length, amountMinor: priced.totalMinor });
    return json(response, 201);
  } catch (e) {
    // Free the key so the customer's retry can succeed rather than 409 forever.
    after(async () => {
      try {
        await releaseIdempotencyKey(body.idempotencyKey);
      } catch {
        // best effort
      }
    });
    log.error("order.create_failed", { orderId, error: errorMessage(e) });
    return json({ error: "order_failed", message: "Could not start checkout. Please try again." }, 502);
  }
}
