import { afterEach, describe, expect, it } from "vitest";
import { env, envReport, resetEnvCache } from "@/lib/env";

const REQUIRED = {
  DATABASE_URL: "postgres://user:pass@host/db",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  APP_URL: "https://vatproof.example",
  CRON_SECRET: "0123456789abcdef0123",
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) {
      if (key in REQUIRED || key.startsWith("VIES_") || key.startsWith("STRIPE_")) delete process.env[key];
    }
    for (const [key, value] of Object.entries(vars)) {
      // Assigning undefined would set the literal string "undefined" in Node.
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
    fn();
  } finally {
    process.env = saved;
    resetEnvCache();
  }
}

afterEach(() => resetEnvCache());

describe("environment validation", () => {
  it("refuses to run with a missing secret, and names it", () => {
    withEnv({ ...REQUIRED, STRIPE_WEBHOOK_SECRET: undefined }, () => {
      expect(() => env()).toThrow(/STRIPE_WEBHOOK_SECRET/);
    });
  });

  it("strips a trailing slash from APP_URL so generated URLs never double up", () => {
    withEnv({ ...REQUIRED, APP_URL: "https://viesproof.eu/" }, () => {
      expect(env().APP_URL).toBe("https://viesproof.eu");
    });
    withEnv({ ...REQUIRED, APP_URL: "https://viesproof.eu///" }, () => {
      expect(env().APP_URL).toBe("https://viesproof.eu");
    });
    withEnv({ ...REQUIRED, APP_URL: "https://viesproof.eu" }, () => {
      expect(env().APP_URL).toBe("https://viesproof.eu");
    });
  });

  it("rejects a relative APP_URL, which would break Stripe redirects", () => {
    withEnv({ ...REQUIRED, APP_URL: "/app" }, () => {
      expect(() => env()).toThrow(/APP_URL/);
    });
  });

  it("rejects a weak cron secret", () => {
    withEnv({ ...REQUIRED, CRON_SECRET: "short" }, () => {
      expect(() => env()).toThrow(/CRON_SECRET/);
    });
  });

  it("supplies production-safe defaults for every optional knob", () => {
    withEnv(REQUIRED, () => {
      const config = env();
      expect(config.VIES_BASE_URL).toContain("ec.europa.eu");
      expect(config.VIES_MAX_CONCURRENCY).toBe(4);
      expect(config.MAX_ITEMS_PER_ORDER).toBe(5000);
      expect(config.DATA_RETENTION_DAYS).toBe(90);
      expect(config.STRIPE_TAX_ENABLED).toBe(false);
    });
  });

  it("coerces numeric overrides from strings and enforces their bounds", () => {
    withEnv({ ...REQUIRED, VIES_MAX_CONCURRENCY: "8" }, () => {
      expect(env().VIES_MAX_CONCURRENCY).toBe(8);
    });
    withEnv({ ...REQUIRED, VIES_MAX_CONCURRENCY: "500" }, () => {
      expect(() => env()).toThrow(/VIES_MAX_CONCURRENCY/);
    });
  });

  it("reports rather than throws, so the health endpoint can answer", () => {
    withEnv({ ...REQUIRED, DATABASE_URL: undefined }, () => {
      const report = envReport();
      expect(report.ok).toBe(false);
      if (!report.ok) expect(report.missing).toContain("DATABASE_URL");
    });
  });
});
