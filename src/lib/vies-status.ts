import { SUPPORTED_COUNTRIES, type CountryCode } from "@/lib/vat";

/**
 * Live availability of each member state's VIES service.
 *
 * VIES is a relay: the Commission forwards every check to the member state's
 * own system, and those go offline independently - for maintenance, often at
 * night and at weekends, and sometimes for hours. VIES publishes which ones
 * are answering at `GET /check-status`, the second of its only two REST
 * endpoints. Nobody presents that well, and "is VIES down" is exactly what an
 * accountant searches for when a check fails, so it is shown here as a page
 * of its own and warned about before a check is run.
 *
 * Read-only and keyless. Callers cache it (60 s), so traffic to this site
 * never turns into traffic to the Commission.
 */

export const DEFAULT_VIES_BASE_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api";

export type Availability = "available" | "unavailable" | "unknown";

export type MemberStateStatus = { countryCode: CountryCode; availability: Availability };

export type ViesStatus = {
  /** False when VIES itself could not be reached; every country is then "unknown". */
  reachable: boolean;
  /** VIES-on-the-web, the Commission's own front end. */
  central: Availability;
  countries: MemberStateStatus[];
  /** ISO timestamp of when this snapshot was taken. */
  checkedAt: string;
};

/** Not `env()`: that demands the database and Stripe secrets, which a status read has no use for. */
export function viesBaseUrl(): string {
  return (process.env.VIES_BASE_URL?.trim() || DEFAULT_VIES_BASE_URL).replace(/\/+$/, "");
}

function availabilityOf(value: unknown): Availability {
  if (typeof value === "boolean") return value ? "available" : "unavailable";
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase();
  if (v === "available") return "available";
  if (v === "unavailable") return "unavailable";
  // e.g. "Monitoring Disabled": the Commission is not watching that state, so
  // it says nothing either way.
  return "unknown";
}

/** Every supported country appears exactly once, in the canonical order, whatever VIES sent. */
export function parseStatus(body: unknown, checkedAt: string): ViesStatus {
  const record = (body && typeof body === "object" ? body : {}) as {
    vow?: { available?: unknown };
    countries?: Array<{ countryCode?: unknown; availability?: unknown }>;
  };
  const reported = new Map<string, Availability>();
  for (const entry of Array.isArray(record.countries) ? record.countries : []) {
    if (entry && typeof entry.countryCode === "string") {
      reported.set(entry.countryCode.toUpperCase(), availabilityOf(entry.availability));
    }
  }
  return {
    reachable: true,
    central: availabilityOf(record.vow?.available),
    countries: SUPPORTED_COUNTRIES.map((countryCode) => ({
      countryCode,
      availability: reported.get(countryCode) ?? "unknown",
    })),
    checkedAt,
  };
}

export function unreachableStatus(checkedAt: string): ViesStatus {
  return {
    reachable: false,
    central: "unknown",
    countries: SUPPORTED_COUNTRIES.map((countryCode) => ({ countryCode, availability: "unknown" as const })),
    checkedAt,
  };
}

/** Never throws: an unreachable VIES is itself the answer, reported as such. */
export async function fetchViesStatus(
  options: { baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<ViesStatus> {
  const { baseUrl = viesBaseUrl(), timeoutMs = 8000, fetchImpl = fetch, now = () => new Date() } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/check-status`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      // Cached for a minute by Next's data cache. "no-store" here would make
      // every page that reads the status dynamic, and every visit a request
      // to the Commission.
      next: { revalidate: 60 },
    });
    if (!res.ok) return unreachableStatus(now().toISOString());
    return parseStatus(await res.json(), now().toISOString());
  } catch {
    return unreachableStatus(now().toISOString());
  } finally {
    clearTimeout(timer);
  }
}

export type StatusSummary = {
  tone: "ok" | "partial" | "down" | "unknown";
  headline: string;
  unavailable: CountryCode[];
};

/** One sentence for the top of the page and the chip on the free check. */
export function summarize(status: ViesStatus, nameOf: (code: CountryCode) => string): StatusSummary {
  const unavailable = status.countries.filter((c) => c.availability === "unavailable").map((c) => c.countryCode);
  const known = status.countries.filter((c) => c.availability !== "unknown").length;

  if (!status.reachable || known === 0) {
    return { tone: "unknown", headline: "VIES is not reporting its status right now.", unavailable };
  }
  if (status.central === "unavailable" || unavailable.length === status.countries.length) {
    return { tone: "down", headline: "VIES is down: no member state is answering.", unavailable };
  }
  if (unavailable.length === 0) {
    return { tone: "ok", headline: `All ${status.countries.length} member states are answering.`, unavailable };
  }
  const names = unavailable.map(nameOf);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return {
    tone: "partial",
    headline: `${list} ${unavailable.length === 1 ? "is" : "are"} not answering. Everything else is up.`,
    unavailable,
  };
}
