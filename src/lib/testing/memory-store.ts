import { assertTransition, isTerminal, type OrderStatus } from "@/lib/state";
import type { ItemCounts, OrderStore, PaymentFacts } from "@/lib/store";
import type { ItemResolution, LedgerEntry, NewOrder, NewOrderItem, Order, OrderItem } from "@/lib/types";

/**
 * In-memory OrderStore used by the money-path tests. It implements the same
 * contract as the Postgres store - including the guarded transitions and the
 * ledger's uniqueness rule - so the tests exercise the real runner logic
 * rather than a mock of it.
 */
export class MemoryOrderStore implements OrderStore {
  readonly orders = new Map<string, Order>();
  readonly items = new Map<string, OrderItem[]>();
  readonly ledger: LedgerEntry[] = [];
  readonly webhookEvents = new Map<string, { type: string; processedAt: Date | null; error: string | null }>();
  private locks = new Map<string, number>();
  now: () => Date = () => new Date();

  async createOrder(order: NewOrder, items: NewOrderItem[]): Promise<void> {
    if ([...this.orders.values()].some((o) => o.publicToken === order.publicToken)) {
      throw new Error("duplicate public token");
    }
    this.orders.set(order.id, {
      id: order.id,
      publicToken: order.publicToken,
      status: "awaiting_payment",
      requesterCountry: order.requesterCountry,
      requesterVat: order.requesterVat,
      itemCount: order.itemCount,
      currency: order.currency,
      amountTotal: order.amountTotal,
      amountRefunded: 0,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      stripeChargeId: null,
      attempts: 0,
      lastError: null,
      createdAt: this.now(),
      paidAt: null,
      completedAt: null,
      purgeAfter: order.purgeAfter,
      purgedAt: null,
    });
    this.items.set(
      order.id,
      items.map((i) => ({
        id: i.id,
        orderId: order.id,
        position: i.position,
        countryCode: i.countryCode,
        vatNumber: i.vatNumber,
        status: "pending",
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        viesValid: null,
        viesRequestId: null,
        viesRequestDate: null,
        viesName: null,
        viesAddress: null,
        checkedAt: null,
        refunded: false,
      })),
    );
  }

  async getOrderById(id: string): Promise<Order | null> {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }

  async getOrderByToken(token: string): Promise<Order | null> {
    const o = [...this.orders.values()].find((x) => x.publicToken === token);
    return o ? { ...o } : null;
  }

  async getOrderBySessionId(sessionId: string): Promise<Order | null> {
    const o = [...this.orders.values()].find((x) => x.stripeSessionId === sessionId);
    return o ? { ...o } : null;
  }

  async getOrderByPaymentIntent(paymentIntentId: string): Promise<Order | null> {
    const o = [...this.orders.values()].find((x) => x.stripePaymentIntentId === paymentIntentId);
    return o ? { ...o } : null;
  }

  async attachCheckoutSession(orderId: string, sessionId: string): Promise<void> {
    const o = this.orders.get(orderId);
    if (o) o.stripeSessionId = sessionId;
  }

  async listItems(orderId: string): Promise<OrderItem[]> {
    return (this.items.get(orderId) ?? []).map((i) => ({ ...i })).sort((a, b) => a.position - b.position);
  }

  async countItems(orderId: string): Promise<ItemCounts> {
    const items = this.items.get(orderId) ?? [];
    return {
      total: items.length,
      pending: items.filter((i) => i.status === "pending").length,
      valid: items.filter((i) => i.status === "valid").length,
      invalid: items.filter((i) => i.status === "invalid").length,
      failed: items.filter((i) => i.status === "failed_permanent").length,
    };
  }

  async claimDueItems(orderId: string, limit: number): Promise<OrderItem[]> {
    const now = this.now().getTime();
    return (this.items.get(orderId) ?? [])
      .filter((i) => i.status === "pending" && (i.nextAttemptAt === null || i.nextAttemptAt.getTime() <= now))
      .sort((a, b) => a.position - b.position)
      .slice(0, limit)
      .map((i) => ({ ...i }));
  }

  async applyResolution(itemId: string, resolution: ItemResolution): Promise<void> {
    for (const list of this.items.values()) {
      const item = list.find((i) => i.id === itemId);
      if (!item || item.status !== "pending") continue;
      item.attempts += 1;
      if (resolution.kind === "answered") {
        item.status = resolution.valid ? "valid" : "invalid";
        item.viesValid = resolution.valid;
        item.viesRequestId = resolution.requestIdentifier;
        item.viesRequestDate = resolution.requestDate;
        item.viesName = resolution.name;
        item.viesAddress = resolution.address;
        item.checkedAt = this.now();
        item.lastError = null;
        item.nextAttemptAt = null;
      } else if (resolution.kind === "retry") {
        item.lastError = resolution.error;
        item.nextAttemptAt = resolution.nextAttemptAt;
      } else {
        item.status = "failed_permanent";
        item.lastError = resolution.error;
        item.nextAttemptAt = null;
        item.checkedAt = this.now();
      }
      return;
    }
  }

  async markItemsRefunded(orderId: string): Promise<void> {
    for (const item of this.items.get(orderId) ?? []) {
      if (item.status === "failed_permanent") item.refunded = true;
    }
  }

  async markPaid(orderId: string, facts: PaymentFacts): Promise<boolean> {
    const o = this.orders.get(orderId);
    if (!o) return false;
    o.stripePaymentIntentId = o.stripePaymentIntentId ?? facts.paymentIntentId;
    o.stripeChargeId = o.stripeChargeId ?? facts.chargeId;
    if (o.status !== "awaiting_payment") return false;
    o.status = "paid";
    o.paidAt = this.now();
    return true;
  }

  async transition(
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
    patch?: { lastError?: string | null },
  ): Promise<boolean> {
    for (const f of from) assertTransition(f, to);
    const o = this.orders.get(orderId);
    if (!o || !from.includes(o.status)) return false;
    o.status = to;
    if (patch?.lastError !== undefined) o.lastError = patch.lastError;
    if (isTerminal(to)) o.completedAt = this.now();
    return true;
  }

  async recordRefund(orderId: string, amountMinor: number, refundId: string): Promise<boolean> {
    const o = this.orders.get(orderId);
    if (!o) return false;
    const duplicate = this.ledger.some((e) => e.orderId === orderId && e.kind === "refund" && e.reference === refundId);
    if (duplicate) return false;
    this.ledger.push({
      orderId,
      kind: "refund",
      amountMinor: -Math.abs(amountMinor),
      currency: o.currency,
      reference: refundId,
      memo: "automatic refund for unanswerable rows",
    });
    o.amountRefunded = Math.min(o.amountTotal, o.amountRefunded + Math.abs(amountMinor));
    return true;
  }

  async recordLedger(entry: LedgerEntry): Promise<void> {
    const duplicate = this.ledger.some(
      (e) => e.orderId === entry.orderId && e.kind === entry.kind && e.reference === entry.reference,
    );
    if (!duplicate) this.ledger.push({ ...entry });
  }

  async listLedger(orderId: string): Promise<LedgerEntry[]> {
    return this.ledger.filter((e) => e.orderId === orderId).map((e) => ({ ...e }));
  }

  async acquireFulfillmentLock(orderId: string, leaseMs: number): Promise<boolean> {
    const now = this.now().getTime();
    const until = this.locks.get(orderId) ?? 0;
    if (until > now) return false;
    this.locks.set(orderId, now + leaseMs);
    return true;
  }

  async releaseFulfillmentLock(orderId: string): Promise<void> {
    this.locks.delete(orderId);
  }

  async bumpOrderAttempt(orderId: string, _nextAttemptAt: Date | null, lastError: string | null): Promise<void> {
    const o = this.orders.get(orderId);
    if (!o) return;
    o.attempts += 1;
    o.lastError = lastError;
  }

  async findDueOrders(limit: number): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((o) => o.status === "paid" || o.status === "processing")
      .slice(0, limit)
      .map((o) => ({ ...o }));
  }

  async expireStaleOrders(olderThan: Date, limit: number): Promise<number> {
    let n = 0;
    for (const o of this.orders.values()) {
      if (n >= limit) break;
      if (o.status === "awaiting_payment" && o.createdAt < olderThan) {
        o.status = "expired";
        o.completedAt = this.now();
        n++;
      }
    }
    return n;
  }

  async deleteExpiredOrders(olderThan: Date, limit: number): Promise<number> {
    let n = 0;
    for (const o of [...this.orders.values()]) {
      if (n >= limit) break;
      const touchedMoney = this.ledger.some((e) => e.orderId === o.id);
      if (o.status === "expired" && o.completedAt && o.completedAt < olderThan && !touchedMoney) {
        this.orders.delete(o.id);
        this.items.delete(o.id);
        n++;
      }
    }
    return n;
  }

  async beginWebhookEvent(eventId: string, type: string): Promise<boolean> {
    if (this.webhookEvents.has(eventId)) return false;
    this.webhookEvents.set(eventId, { type, processedAt: null, error: null });
    return true;
  }

  async finishWebhookEvent(eventId: string, error?: string | null): Promise<void> {
    const e = this.webhookEvents.get(eventId);
    if (e) {
      e.processedAt = this.now();
      e.error = error ?? null;
    }
  }

  async purgeExpired(now: Date, limit: number): Promise<number> {
    let n = 0;
    for (const o of this.orders.values()) {
      if (n >= limit) break;
      if (o.purgedAt === null && o.purgeAfter < now) {
        o.purgedAt = now;
        o.requesterVat = "(purged)";
        for (const item of this.items.get(o.id) ?? []) {
          item.vatNumber = "(purged)";
          item.viesName = null;
          item.viesAddress = null;
        }
        n++;
      }
    }
    return n;
  }

  /** Test helper: total margin for an order across the ledger. */
  marginFor(orderId: string): number {
    return this.ledger.filter((e) => e.orderId === orderId).reduce((sum, e) => sum + e.amountMinor, 0);
  }
}
