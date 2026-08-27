import { query, queryOne, withTransaction } from "@/lib/db";
import { assertTransition, isTerminal, type OrderStatus } from "@/lib/state";
import type { ItemCounts, OrderStore, PaymentFacts } from "@/lib/store";
import type { CountryCode } from "@/lib/vat";
import type { ItemResolution, LedgerEntry, NewOrder, NewOrderItem, Order, OrderItem } from "@/lib/types";

type OrderRow = {
  id: string;
  public_token: string;
  status: string;
  requester_country: string;
  requester_vat: string;
  item_count: number;
  currency: string;
  amount_total: number;
  amount_refunded: number;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  paid_at: Date | null;
  completed_at: Date | null;
  purge_after: Date;
  purged_at: Date | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  position: number;
  country_code: string;
  vat_number: string;
  status: string;
  attempts: number;
  next_attempt_at: Date | null;
  last_error: string | null;
  vies_valid: boolean | null;
  vies_request_id: string | null;
  vies_request_date: string | null;
  vies_name: string | null;
  vies_address: string | null;
  checked_at: Date | null;
  refunded: boolean;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    publicToken: row.public_token,
    status: row.status as OrderStatus,
    requesterCountry: row.requester_country as CountryCode,
    requesterVat: row.requester_vat,
    itemCount: row.item_count,
    currency: row.currency,
    amountTotal: row.amount_total,
    amountRefunded: row.amount_refunded,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeChargeId: row.stripe_charge_id,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    purgeAfter: new Date(row.purge_after),
    purgedAt: row.purged_at ? new Date(row.purged_at) : null,
  };
}

function toItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    position: row.position,
    countryCode: row.country_code as CountryCode,
    vatNumber: row.vat_number,
    status: row.status as OrderItem["status"],
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : null,
    lastError: row.last_error,
    viesValid: row.vies_valid,
    viesRequestId: row.vies_request_id,
    viesRequestDate: row.vies_request_date,
    viesName: row.vies_name,
    viesAddress: row.vies_address,
    checkedAt: row.checked_at ? new Date(row.checked_at) : null,
    refunded: row.refunded,
  };
}

const ORDER_COLUMNS = `id, public_token, status, requester_country, requester_vat, item_count, currency,
  amount_total, amount_refunded, stripe_session_id, stripe_payment_intent_id, stripe_charge_id,
  attempts, last_error, created_at, paid_at, completed_at, purge_after, purged_at`;

export class PgOrderStore implements OrderStore {
  async createOrder(order: NewOrder, items: NewOrderItem[]): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO vatproof.orders (id, public_token, status, requester_country, requester_vat, item_count,
           currency, amount_total, purge_after, client_ip_hash)
         VALUES ($1, $2, 'awaiting_payment', $3, $4, $5, $6, $7, $8, $9)`,
        [
          order.id,
          order.publicToken,
          order.requesterCountry,
          order.requesterVat,
          order.itemCount,
          order.currency,
          order.amountTotal,
          order.purgeAfter,
          order.clientIpHash,
        ],
      );

      // Bulk insert in chunks so a 5000-row order stays a handful of statements.
      const CHUNK = 500;
      for (let i = 0; i < items.length; i += CHUNK) {
        const slice = items.slice(i, i + CHUNK);
        const values: unknown[] = [];
        const tuples = slice.map((item, idx) => {
          const base = idx * 5;
          values.push(item.id, order.id, item.position, item.countryCode, item.vatNumber);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        });
        await client.query(
          `INSERT INTO vatproof.order_items (id, order_id, position, country_code, vat_number) VALUES ${tuples.join(", ")}`,
          values,
        );
      }
    });
  }

  async getOrderById(id: string): Promise<Order | null> {
    const row = await queryOne<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM vatproof.orders WHERE id = $1`, [id]);
    return row ? toOrder(row) : null;
  }

  async getOrderByToken(token: string): Promise<Order | null> {
    const row = await queryOne<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM vatproof.orders WHERE public_token = $1`, [token]);
    return row ? toOrder(row) : null;
  }

  async getOrderBySessionId(sessionId: string): Promise<Order | null> {
    const row = await queryOne<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM vatproof.orders WHERE stripe_session_id = $1`, [sessionId]);
    return row ? toOrder(row) : null;
  }

  async getOrderByPaymentIntent(paymentIntentId: string): Promise<Order | null> {
    const row = await queryOne<OrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM vatproof.orders WHERE stripe_payment_intent_id = $1`,
      [paymentIntentId],
    );
    return row ? toOrder(row) : null;
  }

  async attachCheckoutSession(orderId: string, sessionId: string): Promise<void> {
    await query(`UPDATE vatproof.orders SET stripe_session_id = $2 WHERE id = $1`, [orderId, sessionId]);
  }

  async listItems(orderId: string): Promise<OrderItem[]> {
    const rows = await query<ItemRow>(`SELECT * FROM vatproof.order_items WHERE order_id = $1 ORDER BY position ASC`, [orderId]);
    return rows.map(toItem);
  }

  async countItems(orderId: string): Promise<ItemCounts> {
    const row = await queryOne<{ total: string; pending: string; valid: string; invalid: string; failed: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
              COUNT(*) FILTER (WHERE status = 'valid')::text AS valid,
              COUNT(*) FILTER (WHERE status = 'invalid')::text AS invalid,
              COUNT(*) FILTER (WHERE status = 'failed_permanent')::text AS failed
       FROM vatproof.order_items WHERE order_id = $1`,
      [orderId],
    );
    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      valid: Number(row?.valid ?? 0),
      invalid: Number(row?.invalid ?? 0),
      failed: Number(row?.failed ?? 0),
    };
  }

  async claimDueItems(orderId: string, limit: number): Promise<OrderItem[]> {
    const rows = await query<ItemRow>(
      `SELECT * FROM vatproof.order_items
       WHERE order_id = $1 AND status = 'pending'
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY position ASC LIMIT $2`,
      [orderId, limit],
    );
    return rows.map(toItem);
  }

  async applyResolution(itemId: string, resolution: ItemResolution): Promise<void> {
    if (resolution.kind === "answered") {
      await query(
        `UPDATE vatproof.order_items
         SET status = $2, attempts = attempts + 1, vies_valid = $3, vies_request_id = $4,
             vies_request_date = $5, vies_name = $6, vies_address = $7, checked_at = now(),
             last_error = NULL, next_attempt_at = NULL
         WHERE id = $1 AND status = 'pending'`,
        [
          itemId,
          resolution.valid ? "valid" : "invalid",
          resolution.valid,
          resolution.requestIdentifier,
          resolution.requestDate,
          resolution.name,
          resolution.address,
        ],
      );
      return;
    }
    if (resolution.kind === "retry") {
      await query(
        `UPDATE vatproof.order_items SET attempts = attempts + 1, last_error = $2, next_attempt_at = $3
         WHERE id = $1 AND status = 'pending'`,
        [itemId, resolution.error.slice(0, 500), resolution.nextAttemptAt],
      );
      return;
    }
    await query(
      `UPDATE vatproof.order_items SET status = 'failed_permanent', attempts = attempts + 1,
             last_error = $2, next_attempt_at = NULL, checked_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [itemId, resolution.error.slice(0, 500)],
    );
  }

  async markItemsRefunded(orderId: string): Promise<void> {
    await query(`UPDATE vatproof.order_items SET refunded = true WHERE order_id = $1 AND status = 'failed_permanent'`, [orderId]);
  }

  async markPaid(orderId: string, facts: PaymentFacts): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      `UPDATE vatproof.orders
       SET status = 'paid', paid_at = now(), next_attempt_at = now(),
           stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
           stripe_charge_id = COALESCE($3, stripe_charge_id)
       WHERE id = $1 AND status = 'awaiting_payment'
       RETURNING id`,
      [orderId, facts.paymentIntentId, facts.chargeId],
    );
    if (row) return true;
    // Late-arriving charge facts on an order already marked paid.
    await query(
      `UPDATE vatproof.orders
       SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
           stripe_charge_id = COALESCE(stripe_charge_id, $3)
       WHERE id = $1`,
      [orderId, facts.paymentIntentId, facts.chargeId],
    );
    return false;
  }

  async transition(
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
    patch?: { lastError?: string | null },
  ): Promise<boolean> {
    for (const f of from) assertTransition(f, to);
    const row = await queryOne<{ id: string }>(
      `UPDATE vatproof.orders
       SET status = $3,
           last_error = COALESCE($4, last_error),
           completed_at = CASE WHEN $5 THEN now() ELSE completed_at END
       WHERE id = $1 AND status = ANY($2::text[])
       RETURNING id`,
      [orderId, from, to, patch?.lastError ?? null, isTerminal(to)],
    );
    return row !== null;
  }

  async recordRefund(orderId: string, amountMinor: number, refundId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO vatproof.ledger_entries (order_id, kind, amount_minor, currency, reference, memo)
         SELECT $1, 'refund', $2, currency, $3, 'automatic refund for unanswerable rows' FROM vatproof.orders WHERE id = $1
         ON CONFLICT (order_id, kind, reference) DO NOTHING
         RETURNING id`,
        [orderId, -Math.abs(amountMinor), refundId],
      );
      if (inserted.rowCount === 0) return false;
      await client.query(
        `UPDATE vatproof.orders SET amount_refunded = LEAST(amount_total, amount_refunded + $2) WHERE id = $1`,
        [orderId, Math.abs(amountMinor)],
      );
      return true;
    });
  }

  async recordLedger(entry: LedgerEntry): Promise<void> {
    await query(
      `INSERT INTO vatproof.ledger_entries (order_id, kind, amount_minor, currency, reference, memo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (order_id, kind, reference) DO NOTHING`,
      [entry.orderId, entry.kind, entry.amountMinor, entry.currency, entry.reference, entry.memo],
    );
  }

  async listLedger(orderId: string): Promise<LedgerEntry[]> {
    const rows = await query<{
      order_id: string;
      kind: string;
      amount_minor: number;
      currency: string;
      reference: string | null;
      memo: string | null;
    }>(`SELECT order_id, kind, amount_minor, currency, reference, memo FROM vatproof.ledger_entries WHERE order_id = $1 ORDER BY id ASC`, [
      orderId,
    ]);
    return rows.map((r) => ({
      orderId: r.order_id,
      kind: r.kind as LedgerEntry["kind"],
      amountMinor: r.amount_minor,
      currency: r.currency,
      reference: r.reference,
      memo: r.memo,
    }));
  }

  async acquireFulfillmentLock(orderId: string, leaseMs: number): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      `UPDATE vatproof.orders SET fulfillment_locked_until = now() + ($2::int * interval '1 millisecond')
       WHERE id = $1 AND (fulfillment_locked_until IS NULL OR fulfillment_locked_until < now())
       RETURNING id`,
      [orderId, leaseMs],
    );
    return row !== null;
  }

  async releaseFulfillmentLock(orderId: string): Promise<void> {
    await query(`UPDATE vatproof.orders SET fulfillment_locked_until = NULL WHERE id = $1`, [orderId]);
  }

  async bumpOrderAttempt(orderId: string, nextAttemptAt: Date | null, lastError: string | null): Promise<void> {
    await query(`UPDATE vatproof.orders SET attempts = attempts + 1, next_attempt_at = $2, last_error = $3 WHERE id = $1`, [
      orderId,
      nextAttemptAt,
      lastError ? lastError.slice(0, 500) : null,
    ]);
  }

  async findDueOrders(limit: number): Promise<Order[]> {
    const rows = await query<OrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM vatproof.orders
       WHERE status IN ('paid', 'processing')
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         AND (fulfillment_locked_until IS NULL OR fulfillment_locked_until < now())
       ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return rows.map(toOrder);
  }

  async expireStaleOrders(olderThan: Date, limit: number): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE vatproof.orders SET status = 'expired', completed_at = now()
       WHERE id IN (
         SELECT id FROM vatproof.orders WHERE status = 'awaiting_payment' AND created_at < $1 ORDER BY created_at ASC LIMIT $2
       )
       RETURNING id`,
      [olderThan, limit],
    );
    return rows.length;
  }

  async deleteExpiredOrders(olderThan: Date, limit: number): Promise<number> {
    // Guarded twice over: only 'expired' orders, and only those that never
    // produced a ledger entry. Deleting anything that touched money is a bug,
    // so the query refuses to express it. order_items cascade.
    const rows = await query<{ id: string }>(
      `DELETE FROM vatproof.orders
       WHERE id IN (
         SELECT o.id FROM vatproof.orders o
         WHERE o.status = 'expired'
           AND o.completed_at < $1
           AND NOT EXISTS (SELECT 1 FROM vatproof.ledger_entries l WHERE l.order_id = o.id)
         ORDER BY o.completed_at ASC LIMIT $2
       )
       RETURNING id`,
      [olderThan, limit],
    );
    return rows.length;
  }

  async beginWebhookEvent(eventId: string, type: string): Promise<boolean> {
    const row = await queryOne<{ event_id: string }>(
      `INSERT INTO vatproof.webhook_events (event_id, type) VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [eventId, type],
    );
    return row !== null;
  }

  async finishWebhookEvent(eventId: string, error?: string | null): Promise<void> {
    await query(`UPDATE vatproof.webhook_events SET processed_at = now(), error = $2 WHERE event_id = $1`, [
      eventId,
      error ? error.slice(0, 1000) : null,
    ]);
  }

  async purgeExpired(now: Date, limit: number): Promise<number> {
    const ids = await query<{ id: string }>(
      `SELECT id FROM vatproof.orders WHERE purged_at IS NULL AND purge_after < $1 ORDER BY purge_after ASC LIMIT $2`,
      [now, limit],
    );
    if (ids.length === 0) return 0;
    const list = ids.map((r) => r.id);
    await withTransaction(async (client) => {
      // Keep the ledger and the audit skeleton; drop everything identifying.
      await client.query(
        `UPDATE vatproof.order_items SET vat_number = '(purged)', vies_name = NULL, vies_address = NULL
         WHERE order_id = ANY($1::uuid[])`,
        [list],
      );
      await client.query(
        `UPDATE vatproof.orders SET requester_vat = '(purged)', client_ip_hash = NULL, purged_at = now()
         WHERE id = ANY($1::uuid[])`,
        [list],
      );
    });
    return list.length;
  }
}

export const store: OrderStore = new PgOrderStore();
