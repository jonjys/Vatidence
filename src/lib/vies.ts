import { env } from "@/lib/env";
import type { CountryCode } from "@/lib/vat";

/**
 * Client for the European Commission's VIES REST API - the single external API
 * this product depends on. It is free, keyless, and authoritative.
 *
 * The one detail the whole business rests on: VIES only issues a
 * consultation number (`requestIdentifier`) when the *requester's* own VAT
 * number is supplied. That identifier records who checked which number and when.
 */

export type ViesAnswer = {
  kind: "answer";
  valid: boolean;
  requestIdentifier: string | null;
  requestDate: string | null;
  name: string | null;
  address: string | null;
};

export type ViesFailure = {
  kind: "failure";
  code: string;
  /** Transient failures are retried; permanent ones dead-letter and refund. */
  retryable: boolean;
  message: string;
};

export type ViesResult = ViesAnswer | ViesFailure;

/** VIES error codes that resolve themselves given time. */
const RETRYABLE_CODES = new Set([
  "MS_UNAVAILABLE",
  "MS_MAX_CONCURRENT_REQ",
  "GLOBAL_MAX_CONCURRENT_REQ",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
  "SERVER_BUSY",
  "HTTP_ERROR",
  "NETWORK_ERROR",
  "BAD_RESPONSE",
]);

/** VIES error codes that will never succeed on retry. */
const PERMANENT_CODES = new Set([
  "INVALID_INPUT",
  "INVALID_REQUESTER_INFO",
  "IP_BLOCKED",
  "VAT_BLOCKED",
  "MS_UNAVAILABLE_PERMANENT",
]);

export function classify(code: string): boolean {
  if (PERMANENT_CODES.has(code)) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  // Unknown codes are treated as transient; the attempt ceiling stops the loop.
  return true;
}

export type ViesCheckParams = {
  countryCode: CountryCode;
  vatNumber: string;
  /**
   * The requester's own VAT number. Omitting it is a deliberate, supported
   * call: VIES answers valid/not valid but issues NO consultation number,
   * which is exactly the difference the paid product sells.
   */
  requesterCountryCode?: CountryCode;
  requesterNumber?: string;
};

export interface ViesClient {
  check(params: ViesCheckParams): Promise<ViesResult>;
}

type ViesSuccessBody = {
  valid?: boolean;
  requestIdentifier?: string;
  requestDate?: string;
  name?: string;
  address?: string;
};

type ViesErrorBody = {
  actionSucceed?: boolean;
  errorWrappers?: Array<{ error?: string; message?: string }>;
};

/** VIES fills unknown fields with "---" rather than omitting them. */
function clean(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "" || trimmed === "---") return null;
  return trimmed;
}

export class HttpViesClient implements ViesClient {
  constructor(
    private readonly baseUrl: string = env().VIES_BASE_URL,
    private readonly timeoutMs: number = env().VIES_TIMEOUT_MS,
  ) {}

  async check(params: ViesCheckParams): Promise<ViesResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/check-vat-number`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          countryCode: params.countryCode,
          vatNumber: params.vatNumber,
          // Sent only as a pair; a half-identified requester is rejected.
          ...(params.requesterCountryCode && params.requesterNumber
            ? {
                requesterMemberStateCode: params.requesterCountryCode,
                requesterNumber: params.requesterNumber,
              }
            : {}),
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 429) {
        return { kind: "failure", code: "SERVER_BUSY", retryable: true, message: "VIES rate limited the request" };
      }
      if (!res.ok) {
        return {
          kind: "failure",
          code: "HTTP_ERROR",
          retryable: res.status >= 500 || res.status === 408,
          message: `VIES responded with HTTP ${res.status}`,
        };
      }

      const body = (await res.json()) as ViesSuccessBody & ViesErrorBody;

      if (body.actionSucceed === false || Array.isArray(body.errorWrappers)) {
        const code = body.errorWrappers?.[0]?.error ?? "BAD_RESPONSE";
        return { kind: "failure", code, retryable: classify(code), message: `VIES error ${code}` };
      }

      if (typeof body.valid !== "boolean") {
        return { kind: "failure", code: "BAD_RESPONSE", retryable: true, message: "VIES returned no verdict" };
      }

      return {
        kind: "answer",
        valid: body.valid,
        requestIdentifier: clean(body.requestIdentifier),
        requestDate: clean(body.requestDate),
        name: clean(body.name),
        address: clean(body.address),
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        kind: "failure",
        code: aborted ? "TIMEOUT" : "NETWORK_ERROR",
        retryable: true,
        message: aborted ? `VIES call exceeded ${this.timeoutMs}ms` : `VIES call failed: ${String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Exponential backoff with jitter, bounded so a stuck member state cannot stall an order forever. */
export function backoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60 * 1000);
  const jitter = Math.floor(Math.random() * Math.min(base * 0.2, 60_000));
  return base + jitter;
}
