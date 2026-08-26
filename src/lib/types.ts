import type { CountryCode } from "@/lib/vat";
import type { ItemStatus, OrderStatus } from "@/lib/state";

export type Order = {
  id: string;
  publicToken: string;
  status: OrderStatus;
  requesterCountry: CountryCode;
  requesterVat: string;
  itemCount: number;
  currency: string;
  amountTotal: number;
  amountRefunded: number;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  paidAt: Date | null;
  completedAt: Date | null;
  purgeAfter: Date;
  purgedAt: Date | null;
};

export type OrderItem = {
  id: string;
  orderId: string;
  position: number;
  countryCode: CountryCode;
  vatNumber: string;
  status: ItemStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  viesValid: boolean | null;
  viesRequestId: string | null;
  viesRequestDate: string | null;
  viesName: string | null;
  viesAddress: string | null;
  checkedAt: Date | null;
  refunded: boolean;
};

export type LedgerKind = "charge" | "stripe_fee" | "refund" | "upstream_cost";

export type LedgerEntry = {
  orderId: string;
  kind: LedgerKind;
  amountMinor: number;
  currency: string;
  reference: string | null;
  memo: string | null;
};

export type NewOrder = {
  id: string;
  publicToken: string;
  requesterCountry: CountryCode;
  requesterVat: string;
  itemCount: number;
  amountTotal: number;
  currency: string;
  purgeAfter: Date;
  clientIpHash: string | null;
};

export type NewOrderItem = {
  id: string;
  position: number;
  countryCode: CountryCode;
  vatNumber: string;
};

/** Terminal result written back for one row. */
export type ItemResolution =
  | {
      kind: "answered";
      valid: boolean;
      requestIdentifier: string | null;
      requestDate: string | null;
      name: string | null;
      address: string | null;
    }
  | { kind: "retry"; error: string; nextAttemptAt: Date }
  | { kind: "failed"; error: string };
