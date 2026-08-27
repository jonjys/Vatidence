import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpViesClient, backoffMs, classify } from "@/lib/vies";

const BASE = "https://vies.test/rest-api";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function client() {
  return new HttpViesClient(BASE, 5000);
}

const REQUEST = {
  countryCode: "SE",
  vatNumber: "556036079301",
  requesterCountryCode: "DE",
  requesterNumber: "811907980",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpViesClient", () => {
  it("sends the requester identity, which is what makes the answer evidence", async () => {
    const fetchMock = vi.fn(async () => respond({ valid: true, requestIdentifier: "abc", requestDate: "2026-01-01T00:00:00Z", name: "ACME", address: "Street 1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client().check(REQUEST);

    expect(result).toMatchObject({ kind: "answer", valid: true, requestIdentifier: "abc", name: "ACME" });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(`${BASE}/check-vat-number`);
    expect(JSON.parse(String(call[1].body))).toEqual({
      countryCode: "SE",
      vatNumber: "556036079301",
      requesterMemberStateCode: "DE",
      requesterNumber: "811907980",
    });
  });

  it("omits the requester entirely on a free check, so no consultation number is issued", async () => {
    // The free check is the front door and the paid product is the identifier.
    // Sending a half-identified requester would be rejected by VIES, and
    // sending a full one would give the answer away.
    const fetchMock = vi.fn(async () => respond({ valid: true, requestIdentifier: "", name: "ACME" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new HttpViesClient("https://vies.test", 5_000).check({
      countryCode: "DE",
      vatNumber: "811907980",
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(sent).toEqual({ countryCode: "DE", vatNumber: "811907980" });
    expect(sent).not.toHaveProperty("requesterMemberStateCode");
    expect(sent).not.toHaveProperty("requesterNumber");
    expect(result).toMatchObject({ kind: "answer", valid: true, requestIdentifier: null });
  });

  it("normalises the placeholder values VIES returns for unknown fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ valid: false, requestIdentifier: "", name: "---", address: "   " })));

    const result = await client().check(REQUEST);

    expect(result).toEqual({
      kind: "answer",
      valid: false,
      requestIdentifier: null,
      requestDate: null,
      name: null,
      address: null,
    });
  });

  it("treats a member state outage as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE" }] })));
    const result = await client().check(REQUEST);
    expect(result).toMatchObject({ kind: "failure", code: "MS_UNAVAILABLE", retryable: true });
  });

  it("treats a rejected input as permanent so it is refunded rather than hammered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ actionSucceed: false, errorWrappers: [{ error: "INVALID_INPUT" }] })));
    const result = await client().check(REQUEST);
    expect(result).toMatchObject({ kind: "failure", code: "INVALID_INPUT", retryable: false });
  });

  it("classifies HTTP failures by whether waiting could help", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 503)));
    expect(await client().check(REQUEST)).toMatchObject({ code: "HTTP_ERROR", retryable: true });

    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 400)));
    expect(await client().check(REQUEST)).toMatchObject({ code: "HTTP_ERROR", retryable: false });

    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 429)));
    expect(await client().check(REQUEST)).toMatchObject({ code: "SERVER_BUSY", retryable: true });
  });

  it("turns an abort into a retryable timeout rather than an exception", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    );
    expect(await client().check(REQUEST)).toMatchObject({ kind: "failure", code: "TIMEOUT", retryable: true });
  });

  it("never throws a network error into the caller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await client().check(REQUEST)).toMatchObject({ kind: "failure", code: "NETWORK_ERROR", retryable: true });
  });

  it("refuses to guess when VIES answers without a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ countryCode: "SE" })));
    expect(await client().check(REQUEST)).toMatchObject({ code: "BAD_RESPONSE", retryable: true });
  });
});

describe("classify", () => {
  it("knows which VIES codes are worth retrying", () => {
    expect(classify("MS_MAX_CONCURRENT_REQ")).toBe(true);
    expect(classify("GLOBAL_MAX_CONCURRENT_REQ")).toBe(true);
    expect(classify("IP_BLOCKED")).toBe(false);
    expect(classify("VAT_BLOCKED")).toBe(false);
    // Unknown codes retry, because the attempt ceiling is the real backstop.
    expect(classify("SOMETHING_NEW")).toBe(true);
  });
});

describe("backoffMs", () => {
  it("grows with each attempt and stays bounded", () => {
    const first = backoffMs(1);
    const later = backoffMs(6);
    expect(first).toBeGreaterThanOrEqual(30_000);
    expect(later).toBeGreaterThan(first);
    expect(backoffMs(50)).toBeLessThanOrEqual(6 * 60 * 60 * 1000 + 60_000);
  });
});
