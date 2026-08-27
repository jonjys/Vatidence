import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { guard, json } from "@/lib/http";
import { hashIp } from "@/lib/ids";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/ratelimit";
import { parseVat } from "@/lib/vat";
import { HttpViesClient } from "@/lib/vies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * A free, anonymous check of one VAT number.
 *
 * This is the front door, not a giveaway. A site that is only a checkout has
 * nothing anyone can try, bookmark or mention; the paid product is invisible
 * until someone already trusts it. So the plain answer is free - and the
 * answer itself carries the reason it is not enough: VIES issues a
 * consultation number only when the requester identifies itself, and without
 * that number there is nothing to show an auditor.
 *
 * Nothing here is persisted. The only record is the rate-limit counter keyed
 * by a salted hash of the address, which the privacy notice already documents.
 */

const FREE_PER_MINUTE = 6;
const FREE_PER_HOUR = 40;

const bodySchema = z.object({ vatNumber: z.string().min(3).max(32) });

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: NextRequest): Promise<Response> {
  return guard("POST /api/check", () => check(req));
}

async function check(req: NextRequest): Promise<Response> {
  const config = env();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json", message: "Request body must be JSON." }, 400);
  }

  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return json({ error: "invalid_request", message: "Send a single VAT number." }, 400);
  }

  // Tighter than the paid path: the free check spends the European
  // Commission's capacity, not ours, and bulk use is the product being sold.
  const ipHash = hashIp(clientIp(req), config.CRON_SECRET) ?? "anonymous";
  const perMinute = await rateLimit(`check:min:${ipHash}`, FREE_PER_MINUTE, 60_000);
  const perHour = await rateLimit(`check:hour:${ipHash}`, FREE_PER_HOUR, 3_600_000);
  if (!perMinute.allowed || !perHour.allowed) {
    return json(
      {
        error: "rate_limited",
        message: "That is a lot of single checks. Verify them as one batch instead — it is faster and it comes with proof.",
        resetAt: (perMinute.allowed ? perHour : perMinute).resetAt,
      },
      429,
    );
  }

  const parsed = parseVat(parsedBody.data.vatNumber);
  if (!parsed.ok) {
    return json({ error: "invalid_vat_number", message: parsed.reason }, 400);
  }

  const result = await new HttpViesClient().check({
    countryCode: parsed.value.countryCode,
    vatNumber: parsed.value.vatNumber,
    // Deliberately anonymous: no requester, therefore no consultation number.
  });

  if (result.kind === "failure") {
    log.info("check.upstream_failure", { code: result.code });
    return json(
      {
        error: "upstream_unavailable",
        retryable: result.retryable,
        message: result.retryable
          ? "That member state is not answering right now. It usually clears within minutes."
          : "VIES rejected that request.",
      },
      503,
    );
  }

  return json(
    {
      vatNumber: parsed.value.canonical,
      valid: result.valid,
      name: result.name,
      address: result.address,
      checkedAt: result.requestDate,
      // Stated as fact, because it is one: this call carried no requester.
      consultationNumber: null,
    },
    200,
    { "cache-control": "private, no-store" },
  );
}
