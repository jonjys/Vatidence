import { envReport } from "@/lib/env";
import { pingDatabase } from "@/lib/db";
import { errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail?: string };

async function checkDatabase(): Promise<Check> {
  try {
    return { ok: await pingDatabase() };
  } catch (e) {
    return { ok: false, detail: errorMessage(e) };
  }
}

async function checkVies(): Promise<Check> {
  try {
    const res = await fetch(`${process.env.VIES_BASE_URL ?? "https://ec.europa.eu/taxation_customs/vies/rest-api"}/check-status`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = (await res.json()) as { countries?: Array<{ countryCode: string; availability: string }> };
    const down = (body.countries ?? [])
      .filter((c) => c.availability !== "Available")
      .map((c) => c.countryCode);
    // Individual member states go down constantly; that is a retry concern,
    // not a health failure. Only a dead VIES endpoint is unhealthy.
    return { ok: true, detail: down.length ? `member states unavailable: ${down.join(",")}` : "all member states available" };
  } catch (e) {
    return { ok: false, detail: errorMessage(e) };
  }
}

export async function GET(): Promise<Response> {
  const config = envReport();
  const [database, vies] = await Promise.all([
    config.ok ? checkDatabase() : Promise.resolve<Check>({ ok: false, detail: "env not configured" }),
    checkVies(),
  ]);

  const ok = config.ok && database.ok && vies.ok;
  return Response.json(
    {
      ok,
      service: "viesproof",
      time: new Date().toISOString(),
      checks: {
        env: config.ok ? { ok: true } : { ok: false, detail: `missing/invalid: ${config.missing.join(", ")}` },
        database,
        vies,
      },
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
