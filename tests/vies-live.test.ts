import { describe, expect, it } from "vitest";
import { HttpViesClient } from "@/lib/vies";

/**
 * Live contract check against the real VIES service. Skipped by default so the
 * test suite never depends on a third party being up; run it deliberately with
 *   RUN_LIVE_VIES=1 npm test
 * to confirm the upstream contract has not changed.
 */
const live = process.env.RUN_LIVE_VIES === "1";

describe.skipIf(!live)("VIES live contract", () => {
  const client = new HttpViesClient("https://ec.europa.eu/taxation_customs/vies/rest-api", 20_000);

  it("issues a consultation number when the requester identifies itself", async () => {
    const result = await client.check({
      countryCode: "SE",
      vatNumber: "556036079301",
      requesterCountryCode: "SE",
      requesterNumber: "556036079301",
    });
    if (result.kind === "failure") {
      // A member state outage is exactly what the retry path exists for.
      expect(result.retryable).toBe(true);
      return;
    }
    expect(result.valid).toBe(true);
    expect(result.requestIdentifier).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.name).toBeTruthy();
  }, 30_000);

  it("returns a clean 'not valid' verdict for a made-up number", async () => {
    const result = await client.check({
      countryCode: "SE",
      vatNumber: "123456789101",
      requesterCountryCode: "SE",
      requesterNumber: "556036079301",
    });
    if (result.kind === "failure") {
      expect(result.retryable).toBe(true);
      return;
    }
    expect(result.valid).toBe(false);
    expect(result.requestIdentifier).toBeNull();
  }, 30_000);
});
