-- VATProof core schema.
-- Money path: orders -> order_items -> ledger_entries. Everything else is plumbing.

CREATE TABLE IF NOT EXISTS orders (
  id                        uuid PRIMARY KEY,
  public_token              text NOT NULL UNIQUE,
  status                    text NOT NULL,
  -- requester (the paying business) - a VAT number is a business identifier, not personal data.
  requester_country         char(2) NOT NULL,
  requester_vat             text NOT NULL,
  item_count                integer NOT NULL CHECK (item_count > 0),
  -- money, minor units (cents), EUR
  currency                  char(3) NOT NULL DEFAULT 'eur',
  amount_total              integer NOT NULL CHECK (amount_total >= 0),
  amount_refunded           integer NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
  -- stripe linkage
  stripe_session_id         text UNIQUE,
  stripe_payment_intent_id  text,
  stripe_charge_id          text,
  -- fulfillment control
  attempts                  integer NOT NULL DEFAULT 0,
  fulfillment_locked_until  timestamptz,
  next_attempt_at           timestamptz,
  last_error                text,
  -- lifecycle
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  paid_at                   timestamptz,
  completed_at              timestamptz,
  purge_after               timestamptz NOT NULL,
  purged_at                 timestamptz,
  client_ip_hash            text
);

CREATE INDEX IF NOT EXISTS orders_status_next_attempt_idx
  ON orders (status, next_attempt_at)
  WHERE status IN ('paid', 'processing');
CREATE INDEX IF NOT EXISTS orders_purge_idx ON orders (purge_after) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id                    uuid PRIMARY KEY,
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position              integer NOT NULL,
  country_code          char(2) NOT NULL,
  vat_number            text NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  attempts              integer NOT NULL DEFAULT 0,
  next_attempt_at       timestamptz,
  last_error            text,
  -- VIES result
  vies_valid            boolean,
  vies_request_id       text,
  vies_request_date     text,
  vies_name             text,
  vies_address          text,
  checked_at            timestamptz,
  refunded              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, position)
);

CREATE INDEX IF NOT EXISTS order_items_order_status_idx ON order_items (order_id, status);

-- Append-only double-sided ledger. margin = SUM(amount_minor) over an order.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            bigserial PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind          text NOT NULL,           -- charge | stripe_fee | refund | upstream_cost
  amount_minor  integer NOT NULL,        -- signed: revenue positive, cost/refund negative
  currency      char(3) NOT NULL DEFAULT 'eur',
  reference     text,                    -- stripe object id / dedupe key
  memo          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind, reference)
);

CREATE INDEX IF NOT EXISTS ledger_order_idx ON ledger_entries (order_id);

-- Stripe webhook idempotency. One row per delivered event id.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id      text PRIMARY KEY,
  type          text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  error         text
);

-- Order-creation idempotency (client supplied Idempotency-Key).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           text PRIMARY KEY,
  request_hash  text NOT NULL,
  order_id      uuid REFERENCES orders(id) ON DELETE CASCADE,
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Fixed-window rate limiting without extra infrastructure.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        text NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
