import { query, queryOne } from "@/lib/db";

export type RateLimitVerdict = { allowed: boolean; remaining: number; resetAt: Date };

/**
 * Fixed-window counter in Postgres. Not the most elegant limiter in the world,
 * but it needs no extra service and it is exactly accurate enough to stop the
 * two things that matter: cost abuse of the free upstream, and order spam.
 */
export async function rateLimit(bucket: string, limit: number, windowMs: number): Promise<RateLimitVerdict> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const row = await queryOne<{ hits: number }>(
    `INSERT INTO vatproof.rate_limits (bucket, window_start, hits) VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits`,
    [bucket, windowStart],
  );
  const hits = row?.hits ?? 1;
  return {
    allowed: hits <= limit,
    remaining: Math.max(0, limit - hits),
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}

export async function pruneRateLimits(olderThan: Date): Promise<void> {
  await query(`DELETE FROM vatproof.rate_limits WHERE window_start < $1`, [olderThan]);
}
