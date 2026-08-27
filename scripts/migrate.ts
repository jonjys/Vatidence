/**
 * Migration runner. Applies db/migrations/*.sql in filename order exactly once,
 * inside a transaction, recording each in schema_migrations.
 *
 *   DATABASE_URL=postgres://... npm run migrate
 *
 * `npm run build` invokes this with --optional, so a deploy that has
 * DATABASE_URL configured migrates itself and there is no manual step. Without
 * DATABASE_URL (local builds, CI) it skips instead of failing. A misconfigured
 * or unreachable database is still a hard failure - a deploy that cannot
 * migrate must not ship.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import pg from "pg";

const DIR = join(process.cwd(), "db", "migrations");

/** Session-level lock key, so concurrent deploys serialise instead of racing. */
const LOCK_KEY = 8_241_773;

async function main(): Promise<void> {
  const optional = process.argv.includes("--optional");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (optional) {
      console.log("DATABASE_URL is not set - skipping migrations.");
      return;
    }
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  // Plain TCP via node-postgres: this script runs on a workstation or in CI,
  // never inside a serverless function.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: local || /sslmode=disable/.test(connectionString) ? undefined : { rejectUnauthorized: true },
  });
  const client = await pool.connect();

  try {
    // Two deploys building at once must not both try to apply the same file.
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const applied = new Map<string, string>(
      (await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations")).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );

    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;

    for (const file of files) {
      const sql = readFileSync(join(DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(file);

      if (previous) {
        if (previous !== checksum) {
          throw new Error(`Migration ${file} was modified after it was applied. Add a new migration instead.`);
        }
        continue;
      }

      process.stdout.write(`applying ${file} ... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        ran++;
        process.stdout.write("ok\n");
      } catch (e) {
        await client.query("ROLLBACK");
        process.stdout.write("failed\n");
        throw e;
      }
    }

    console.log(ran === 0 ? "Database already up to date." : `Applied ${ran} migration(s).`);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } catch {
      // The session is gone; Postgres releases the lock with it.
    }
    client.release();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
