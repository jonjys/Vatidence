import { MemoryOrderStore } from "@/lib/testing/memory-store";
import type { RefundGateway } from "@/lib/refunds";
import type { CountryCode } from "@/lib/vat";
import type { ViesClient, ViesResult } from "@/lib/vies";
import type { Order } from "@/lib/types";

export function makeClock(start = new Date("2026-01-01T00:00:00.000Z")) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** VIES stand-in: a scripted queue of results per VAT number. */
export class FakeVies implements ViesClient {
  calls: Array<{ vat: string; requester: string }> = [];
  constructor(private readonly script: Map<string, ViesResult[]>) {}

  async check(params: {
    countryCode: CountryCode;
    vatNumber: string;
    requesterCountryCode: CountryCode;
    requesterNumber: string;
  }): Promise<ViesResult> {
    const key = `${params.countryCode}${params.vatNumber}`;
    this.calls.push({ vat: key, requester: `${params.requesterCountryCode}${params.requesterNumber}` });
    const queue = this.script.get(key);
    if (!queue || queue.length === 0) {
      return { kind: "answer", valid: true, requestIdentifier: `id-${key}`, requestDate: "2026-01-01T00:00:00.000Z", name: "ACME", address: "Somewhere" };
    }
    return queue.length === 1 ? (queue[0] as ViesResult) : (queue.shift() as ViesResult);
  }
}

export function answer(valid: boolean, id = "consultation-1"): ViesResult {
  return {
    kind: "answer",
    valid,
    requestIdentifier: valid ? id : null,
    requestDate: "2026-01-01T00:00:00.000Z",
    name: valid ? "ACME AB" : null,
    address: valid ? "Street 1" : null,
  };
}

export function transientFailure(code = "MS_UNAVAILABLE"): ViesResult {
  return { kind: "failure", code, retryable: true, message: `${code} from member state` };
}

export function permanentFailure(code = "INVALID_INPUT"): ViesResult {
  return { kind: "failure", code, retryable: false, message: `${code} from VIES` };
}

export class FakeRefunds implements RefundGateway {
  calls: Array<{ paymentIntentId: string; amountMinor: number; idempotencyKey: string }> = [];
  failures = 0;
  /** Same idempotency key returns the same refund id, exactly like Stripe. */
  private issued = new Map<string, string>();

  async refund(params: { paymentIntentId: string; amountMinor: number; idempotencyKey: string; reason: string }) {
    if (this.failures > 0) {
      this.failures--;
      throw new Error("stripe unavailable");
    }
    this.calls.push({ ...params });
    const existing = this.issued.get(params.idempotencyKey);
    if (existing) return { id: existing };
    const id = `re_${this.issued.size + 1}`;
    this.issued.set(params.idempotencyKey, id);
    return { id };
  }
}

export async function seedPaidOrder(
  store: MemoryOrderStore,
  opts: { vats: string[]; amountTotal: number; orderId?: string },
): Promise<Order> {
  const orderId = opts.orderId ?? "order-1";
  await store.createOrder(
    {
      id: orderId,
      publicToken: `tok-${orderId}`,
      requesterCountry: "SE",
      requesterVat: "556036079301",
      itemCount: opts.vats.length,
      amountTotal: opts.amountTotal,
      currency: "eur",
      purgeAfter: new Date("2099-01-01T00:00:00.000Z"),
      clientIpHash: null,
    },
    opts.vats.map((v, idx) => ({
      id: `${orderId}-item-${idx}`,
      position: idx + 1,
      countryCode: v.slice(0, 2) as CountryCode,
      vatNumber: v.slice(2),
    })),
  );
  await store.markPaid(orderId, {
    paymentIntentId: `pi_${orderId}`,
    chargeId: `ch_${orderId}`,
    amountTotalMinor: opts.amountTotal,
    currency: "eur",
  });
  await store.recordLedger({
    orderId,
    kind: "charge",
    amountMinor: opts.amountTotal,
    currency: "eur",
    reference: `pi_${orderId}`,
    memo: "payment",
  });
  const order = await store.getOrderById(orderId);
  if (!order) throw new Error("seed failed");
  return order;
}
