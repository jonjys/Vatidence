import { z } from "zod";

/**
 * Server environment. Validated lazily so `next build` and unit tests never
 * require production secrets, but any request path that needs a secret fails
 * loudly and immediately with a readable message.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon pooled connection string)"),
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
  // Trailing slashes are stripped: this value is concatenated with paths, and
  // "https://example.com/" would otherwise yield "https://example.com//r/token".
  APP_URL: z
    .string()
    .url("APP_URL must be an absolute URL, e.g. https://vatproof.example")
    .transform((v) => v.replace(/\/+$/, "")),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),

  // Optional knobs, all with production-safe defaults.
  VIES_BASE_URL: z.string().url().default("https://ec.europa.eu/taxation_customs/vies/rest-api"),
  VIES_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  VIES_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  MAX_ITEMS_PER_ORDER: z.coerce.number().int().min(1).max(20000).default(5000),
  MAX_ITEM_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  RUN_BUDGET_MS: z.coerce.number().int().min(1000).max(280000).default(45000),
  DATA_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),

  /**
   * Appended to the account-wide statement descriptor prefix, so a charge reads
   * e.g. "FREDCAST.S* VATIDENCE" on the cardholder's statement instead of only
   * the account name. Stripe caps prefix + "* " + suffix at 22 characters and
   * the prefix can be up to 10, so 10 is the longest suffix that is always safe.
   * An unrecognised descriptor is the most common cause of chargebacks.
   */
  STRIPE_STATEMENT_SUFFIX: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Za-z0-9 .\-]+$/, "STRIPE_STATEMENT_SUFFIX may only contain letters, digits, spaces, dots and hyphens")
    .regex(/[A-Za-z]/, "STRIPE_STATEMENT_SUFFIX must contain at least one letter")
    .default("VATIDENCE"),

  STRIPE_TAX_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Non-throwing variant used by /api/health so the probe can report, not crash. */
export function envReport(): { ok: true } | { ok: false; missing: string[] } {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return { ok: true };
  return { ok: false, missing: parsed.error.issues.map((i) => i.path.join(".")) };
}

/** Test hook: forget the memoised env after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}
