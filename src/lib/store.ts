import type { ItemResolution, LedgerEntry, NewOrder, NewOrderItem, Order, OrderItem } from "@/lib/types";
import type { OrderStatus } from "@/lib/state";

export type ItemCounts = {
  total: number;
  pending: number;
  valid: number;
  invalid: number;
  failed: number;
};

export type PaymentFacts = {
  paymentIntentId: string | null;
  chargeId: string | null;
  amountTotalMinor: number;
  currency: string;
};

/**
 * Everything the money path touches, behind one interface. The Postgres
 * implementation runs in production; an in-memory implementation runs the
 * money-path tests, so those tests exercise the real orchestration logic.
 */
export interface OrderStore {
  createOrder(order: NewOrder, items: NewOrderItem[]): Promise<void>;
  getOrderById(id: string): Promise<Order | null>;
  getOrderByToken(token: string): Promise<Order | null>;
  getOrderBySessionId(sessionId: string): Promise<Order | null>;
  getOrderByPaymentIntent(paymentIntentId: string): Promise<Order | null>;

  attachCheckoutSession(orderId: string, sessionId: string): Promise<void>;

  listItems(orderId: string): Promise<OrderItem[]>;
  countItems(orderId: string): Promise<ItemCounts>;
  /** Rows that are pending and whose backoff has elapsed. */
  claimDueItems(orderId: string, limit: number): Promise<OrderItem[]>;
  applyResolution(itemId: string, resolution: ItemResolution): Promise<void>;
  markItemsRefunded(orderId: string): Promise<void>;

  /**
   * Idempotent payment capture. Returns true only for the call that actually
   * moved the order out of `awaiting_payment`, so ledger writes happen once.
   */
  markPaid(orderId: string, facts: PaymentFacts): Promise<boolean>;
  /** Guarded transition; returns false when another worker already moved it. */
  transition(orderId: string, from: OrderStatus[], to: OrderStatus, patch?: { lastError?: string | null }): Promise<boolean>;
  recordRefund(orderId: string, amountMinor: number, refundId: string): Promise<boolean>;

  recordLedger(entry: LedgerEntry): Promise<void>;
  listLedger(orderId: string): Promise<LedgerEntry[]>;

  acquireFulfillmentLock(orderId: string, leaseMs: number): Promise<boolean>;
  releaseFulfillmentLock(orderId: string): Promise<void>;
  bumpOrderAttempt(orderId: string, nextAttemptAt: Date | null, lastError: string | null): Promise<void>;

  /** Recovery sweep: paid/processing orders with work due. */
  findDueOrders(limit: number): Promise<Order[]>;
  /** Checkout sessions that were never paid. */
  expireStaleOrders(olderThan: Date, limit: number): Promise<number>;
  /**
   * Delete expired orders outright. They never took money, so they carry no
   * ledger entry and no obligation - only rows. Without this, abandoned and
   * abusive checkouts accumulate forever against a finite storage budget.
   */
  deleteExpiredOrders(olderThan: Date, limit: number): Promise<number>;

  /** Stripe webhook idempotency. Returns false when the event was already seen. */
  beginWebhookEvent(eventId: string, type: string): Promise<boolean>;
  finishWebhookEvent(eventId: string, error?: string | null): Promise<void>;

  /** GDPR retention: strip upstream-returned trader details past their window. */
  purgeExpired(now: Date, limit: number): Promise<number>;
}
