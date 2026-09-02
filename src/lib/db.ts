import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "@/lib/env";

// The serverless driver needs a WebSocket implementation for pooled
// (transaction-capable) connections when running on Node.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export type QueryResultLike<T> = { rows: T[]; rowCount: number | null };

export interface ClientLike {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResultLike<T>>;
  release(): void;
}

/**
 * The minimal surface both the Neon serverless driver and node-postgres
 * satisfy. Production runs on Neon; the integration tests point the same SQL
 * at a local Postgres, so the queries that move money are executed for real.
 */
export interface PoolLike {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResultLike<T>>;
  connect(): Promise<ClientLike>;
}

type GlobalWithPool = typeof globalThis & { __viesproofPool?: PoolLike };

let override: PoolLike | null = null;

/** Test seam: point the data layer at another Postgres-compatible pool. */
export function setPoolForTesting(next: PoolLike | null): void {
  override = next;
}

/** One pool per warm lambda instance; Neon's pooler handles the rest. */
export function pool(): PoolLike {
  if (override) return override;
  const g = globalThis as GlobalWithPool;
  if (!g.__viesproofPool) {
    g.__viesproofPool = new Pool({ connectionString: env().DATABASE_URL, max: 3 }) as unknown as PoolLike;
  }
  return g.__viesproofPool;
}

export async function query<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: ClientLike) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already gone; the transaction is rolled back anyway.
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  const row = await queryOne<{ ok: number }>("SELECT 1 AS ok");
  return row?.ok === 1;
}
