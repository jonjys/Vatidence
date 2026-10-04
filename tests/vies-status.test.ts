import { describe, expect, it, vi } from "vitest";
import { COUNTRIES } from "@/lib/countries";
import { SUPPORTED_COUNTRIES } from "@/lib/vat";
import { fetchViesStatus, parseStatus, summarize, unreachableStatus, viesBaseUrl } from "@/lib/vies-status";

const AT = "2026-10-04T07:00:00.000Z";
const nameOf = (code: keyof typeof COUNTRIES) => COUNTRIES[code].name;

/** The shape VIES actually returned on 2026-10-04, with Germany offline. */
function liveBody(overrides: Record<string, string> = {}) {
  return {
    vow: { available: true },
    countries: SUPPORTED_COUNTRIES.map((countryCode) => ({
      countryCode,
      availability: overrides[countryCode] ?? "Available",
    })),
  };
}

describe("parseStatus", () => {
  it("reads VIES's own response", () => {
    const status = parseStatus(liveBody({ DE: "Unavailable" }), AT);
    expect(status.reachable).toBe(true);
    expect(status.central).toBe("available");
    expect(status.countries).toHaveLength(SUPPORTED_COUNTRIES.length);
    expect(status.countries.find((c) => c.countryCode === "DE")?.availability).toBe("unavailable");
    expect(status.countries.find((c) => c.countryCode === "SE")?.availability).toBe("available");
  });

  it("lists every supported country even when VIES leaves one out", () => {
    const body = liveBody();
    body.countries = body.countries.filter((c) => c.countryCode !== "XI");
    const status = parseStatus(body, AT);
    expect(status.countries.map((c) => c.countryCode)).toEqual([...SUPPORTED_COUNTRIES]);
    expect(status.countries.find((c) => c.countryCode === "XI")?.availability).toBe("unknown");
  });

  it("treats anything but Available/Unavailable as no signal, not as up", () => {
    const status = parseStatus(liveBody({ IT: "Monitoring Disabled" }), AT);
    expect(status.countries.find((c) => c.countryCode === "IT")?.availability).toBe("unknown");
  });

  it("survives garbage", () => {
    expect(parseStatus(null, AT).countries.every((c) => c.availability === "unknown")).toBe(true);
    expect(parseStatus({ countries: "nope" }, AT).countries).toHaveLength(SUPPORTED_COUNTRIES.length);
  });
});

describe("summarize", () => {
  it("says all are answering when they are", () => {
    const s = summarize(parseStatus(liveBody(), AT), nameOf);
    expect(s.tone).toBe("ok");
    expect(s.headline).toBe(`All ${SUPPORTED_COUNTRIES.length} member states are answering.`);
  });

  it("names the one member state that is down", () => {
    const s = summarize(parseStatus(liveBody({ DE: "Unavailable" }), AT), nameOf);
    expect(s.tone).toBe("partial");
    expect(s.unavailable).toEqual(["DE"]);
    expect(s.headline).toBe("Germany is not answering. Everything else is up.");
  });

  it("lists several in plain English", () => {
    const s = summarize(parseStatus(liveBody({ DE: "Unavailable", ES: "Unavailable", FR: "Unavailable" }), AT), nameOf);
    expect(s.headline).toBe("Germany, Spain and France are not answering. Everything else is up.");
  });

  it("calls VIES down when the central service is", () => {
    const body = { ...liveBody(), vow: { available: false } };
    expect(summarize(parseStatus(body, AT), nameOf).tone).toBe("down");
  });

  it("does not claim anything when VIES could not be reached", () => {
    const s = summarize(unreachableStatus(AT), nameOf);
    expect(s.tone).toBe("unknown");
    expect(s.headline).toMatch(/not reporting/);
  });
});

describe("fetchViesStatus", () => {
  it("asks VIES's check-status endpoint and parses the answer", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(liveBody({ PL: "Unavailable" })), { status: 200 }));
    const status = await fetchViesStatus({ baseUrl: "https://vies.test/rest-api", fetchImpl, now: () => new Date(AT) });
    expect(fetchImpl).toHaveBeenCalledWith("https://vies.test/rest-api/check-status", expect.anything());
    expect(status.checkedAt).toBe(AT);
    expect(status.countries.find((c) => c.countryCode === "PL")?.availability).toBe("unavailable");
  });

  it("reports an unreachable VIES instead of throwing", async () => {
    const down = await fetchViesStatus({
      fetchImpl: vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    });
    expect(down.reachable).toBe(false);

    const error = await fetchViesStatus({ fetchImpl: vi.fn(async () => new Response("oops", { status: 502 })) });
    expect(error.reachable).toBe(false);
  });

  it("uses the configured base URL without demanding the payment secrets", () => {
    const before = process.env.VIES_BASE_URL;
    process.env.VIES_BASE_URL = "https://mirror.example/rest-api/";
    expect(viesBaseUrl()).toBe("https://mirror.example/rest-api");
    delete process.env.VIES_BASE_URL;
    expect(viesBaseUrl()).toBe("https://ec.europa.eu/taxation_customs/vies/rest-api");
    if (before !== undefined) process.env.VIES_BASE_URL = before;
  });
});
