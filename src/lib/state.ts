/**
 * Order state machine. Every money-affecting transition goes through
 * `assertTransition`, so an illegal move throws instead of silently corrupting
 * the ledger.
 */

export const ORDER_STATUSES = [
  "awaiting_payment", // checkout session created, no money yet
  "paid", // Stripe confirmed payment, nothing fulfilled yet
  "processing", // at least one upstream call in flight / partially done
  "fulfilled", // every row reached a terminal answer
  "partially_refunded", // some rows permanently unanswerable, pro-rata refunded
  "refunded_failed", // no row could be answered, fully refunded
  "refunded", // refunded out of band (e.g. from the Stripe dashboard)
  "expired", // checkout abandoned or expired; no money ever moved
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "fulfilled",
  "partially_refunded",
  "refunded_failed",
  "refunded",
  "expired",
];

/** Statuses in which money has actually been captured. */
export const PAID_STATUSES: readonly OrderStatus[] = [
  "paid",
  "processing",
  "fulfilled",
  "partially_refunded",
  "refunded_failed",
  "refunded",
];

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  awaiting_payment: ["paid", "expired"],
  paid: ["processing", "refunded"],
  // re-entrant: a resumed fulfillment pass stays in `processing`
  processing: ["processing", "fulfilled", "partially_refunded", "refunded_failed", "refunded"],
  fulfilled: ["refunded"],
  partially_refunded: ["refunded"],
  refunded_failed: [],
  refunded: [],
  expired: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Illegal order transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isPaid(status: OrderStatus): boolean {
  return PAID_STATUSES.includes(status);
}

/** Fulfillment may only run against money we actually hold. */
export function isFulfillable(status: OrderStatus): boolean {
  return status === "paid" || status === "processing";
}

export const ITEM_STATUSES = [
  "pending", // not yet answered
  "valid", // VIES says the VAT number is valid
  "invalid", // VIES says it is not valid - a legitimate, billable answer
  "failed_permanent", // dead letter: we give up and refund this row
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export function isItemTerminal(status: ItemStatus): boolean {
  return status !== "pending";
}

/** A row is "answered" (billable) when VIES gave us a verdict either way. */
export function isItemAnswered(status: ItemStatus): boolean {
  return status === "valid" || status === "invalid";
}

/**
 * Given the terminal composition of an order's rows, the outcome is fixed.
 * This is the single place that decides whether money is kept or given back.
 */
export function outcomeFor(totalRows: number, failedRows: number): {
  status: Extract<OrderStatus, "fulfilled" | "partially_refunded" | "refunded_failed">;
  refundRows: number;
} {
  if (failedRows <= 0) return { status: "fulfilled", refundRows: 0 };
  if (failedRows >= totalRows) return { status: "refunded_failed", refundRows: totalRows };
  return { status: "partially_refunded", refundRows: failedRows };
}
