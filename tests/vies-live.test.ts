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

  /**
   * Why this test exists.
   *
   * The obvious next product on top of this one is the "qualified" check -
   * sending the trader's name and address and reporting whether they match the
   * registry, which is what German law (qualifizierte Bestaetigungsabfrage)
   * asks for and what a plain validity check explicitly does not satisfy.
   *
   * Measured 2026-08-27: the REST API accepts the trader fields and answers
   * NOT_PROCESSED for every one of them, in every member state tried
   * (DE, NL, PL, SE, IE, DK, PT, LU, IT). Only the legacy SOAP endpoint
   * performs the match at all, and only a minority of member states answer it
   * there - Germany is not among them. So the feature cannot be built on this
   * API today.
   *
   * This test pins that finding to reality. If the Commission ever starts
   * processing the match, this fails, and the opportunity is worth revisiting.
   */
  it("still does not process the qualified trader match, so that product is not available", async () => {
    const res = await fetch("https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        countryCode: "DE",
        vatNumber: "811907980",
        requesterMemberStateCode: "SE",
        requesterNumber: "556036079301",
        traderName: "Bayerische Motoren Werke",
        traderStreet: "Petuelring 130",
        traderPostalCode: "80809",
        traderCity: "Muenchen",
        traderCompanyType: "AG",
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (body.actionSucceed === false) return; // member state busy; nothing to assert

    expect(body.traderNameMatch).toBe("NOT_PROCESSED");
    expect(body.traderStreetMatch).toBe("NOT_PROCESSED");
    expect(body.traderPostalCodeMatch).toBe("NOT_PROCESSED");
    expect(body.traderCityMatch).toBe("NOT_PROCESSED");
    expect(body.traderCompanyTypeMatch).toBe("NOT_PROCESSED");
  }, 30_000);
});
