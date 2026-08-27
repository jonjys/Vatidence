import { query, queryOne } from "@/lib/db";

export type StoredIdempotentResponse = { orderId: string | null; response: unknown; requestHash: string };

/**
 * Claim an idempotency key. Returns the previously stored response when the
 * same key is replayed, so a retried POST /api/orders never creates a second
 * order or a second Stripe Checkout Session.
 */
export async function claimIdempotencyKey(
  key: string,
  requestHash: string,
): Promise<{ claimed: true } | { claimed: false; existing: StoredIdempotentResponse }> {
  const inserted = await queryOne<{ key: string }>(
    `INSERT INTO vatproof.idempotency_keys (key, request_hash) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING RETURNING key`,
    [key, requestHash],
  );
  if (inserted) return { claimed: true };

  const existing = await queryOne<{ order_id: string | null; response: unknown; request_hash: string }>(
    `SELECT order_id, response, request_hash FROM vatproof.idempotency_keys WHERE key = $1`,
    [key],
  );
  return {
    claimed: false,
    existing: {
      orderId: existing?.order_id ?? null,
      response: existing?.response ?? null,
      requestHash: existing?.request_hash ?? "",
    },
  };
}

export async function completeIdempotencyKey(key: string, orderId: string, response: unknown): Promise<void> {
  await query(`UPDATE vatproof.idempotency_keys SET order_id = $2, response = $3 WHERE key = $1`, [
    key,
    orderId,
    JSON.stringify(response),
  ]);
}

export async function releaseIdempotencyKey(key: string): Promise<void> {
  await query(`DELETE FROM vatproof.idempotency_keys WHERE key = $1 AND order_id IS NULL`, [key]);
}
