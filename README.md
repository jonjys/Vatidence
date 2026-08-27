# VATProof

A machine that sits between EU businesses and the European Commission's VIES
service, and charges per verified VAT number.

Someone pastes a list of customer VAT numbers, pays, and gets back every
official VIES **consultation number** plus a sealed PDF/CSV evidence pack. No
account, no login, no dashboard, no subscription. Nobody operates it.

---

## The money

| | |
|---|---|
| **Who pays** | EU businesses that invoice other EU businesses at 0% VAT (reverse charge): accountants, bookkeepers, finance teams, SaaS billing operators. |
| **What they pay for** | One-off batch verification. €0.39/number up to 25, €0.19 up to 250, €0.11 up to 2 000, €0.07 above. Minimum order €4.90. A 100-number batch is €24.00. |
| **Our cost per order** | The Stripe fee. Nothing else — VIES is a free, keyless government API. |
| **Gross margin** | ~93% at €24 (Stripe EU cards ≈ 1.5% + €0.25 ⇒ ≈ €0.61). Rows the upstream cannot answer are auto-refunded, so revenue only exists where a real answer was delivered. |
| **Why they buy** | Checking VIES by hand takes ~40 seconds per number and only produces a consultation number if the requester's own VAT number is entered — which most people don't know. 100 numbers is 1–2 hours of billable time; we do it for €24. |

### Why the consultation number is the product

`POST /check-vat-number` without a requester returns a bare yes/no.
The *same call with `requesterMemberStateCode` and `requesterNumber`* returns a
`requestIdentifier` — a unique identifier recording who checked which number and
when. That identifier is the evidence a tax authority asks for when a zero-rated
intra-EU invoice is challenged; without it the seller can be assessed for the VAT
they did not charge. This service always sends the requester identity. That is
the whole asymmetry the business sits on.

---

## Deploying it (about 15 minutes, once)

1. **Create a Neon database.** [neon.tech](https://neon.tech) → new project →
   copy the **pooled** connection string (the host contains `-pooler`).

2. **Deploy.**
   ```bash
   vercel --prod
   ```
   Set the environment variables from [`.env.example`](.env.example) in the
   Vercel project (all of the "Required" block). `APP_URL` must be the final
   production URL.

   The schema applies itself: `npm run build` runs the migration runner before
   `next build`, so every deploy that has `DATABASE_URL` configured migrates
   first and a deploy that cannot migrate fails instead of shipping. Concurrent
   deploys serialise on a Postgres advisory lock. Nothing to run by hand — and
   `npm run migrate` is still there if you want to apply migrations without
   deploying.

3. **Create the Stripe webhook.** Stripe Dashboard → Developers → Webhooks →
   Add endpoint → `https://YOUR-DOMAIN/api/stripe/webhook`, subscribed to:
   ```
   checkout.session.completed
   checkout.session.async_payment_succeeded
   checkout.session.expired
   charge.succeeded
   charge.refunded
   ```
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

4. **Check it is alive.** `curl https://YOUR-DOMAIN/api/health` → `{"ok":true,…}`.

There is no step 5. The cron entry in `vercel.json` is created by the deploy, and
no external API account is needed — VIES requires no key and no registration.

### First-deploy traps

Five things bite on a fresh Vercel project, none of them code:

1. **Deployment Protection.** New projects linked to a private repo enable
   Vercel Authentication, which 302-redirects every visitor to a Vercel login.
   A paying customer cannot reach checkout through that. Turn it off:
   Project → Settings → Deployment Protection → Vercel Authentication → Disabled.
2. **`404: NOT_FOUND` on the correct URL.** This means the deployment that
   production currently points at does not contain the app — typically an
   older commit, because a newer one failed or was blocked. The URL is not the
   problem. Check which commit is serving production before touching any code:
   Project → Deployments, and read the commit on the row marked *Production*.
3. **Deployments in `BLOCKED` state.** A deployment created and "ready" in the
   same millisecond, with no build logs, was never built — that is an
   account-level block (Hobby free-tier deployment limits), not a build failure.
   Nothing in this repo can fix it; check the Vercel dashboard's usage page.
4. **Unauthorized Git author.** Vercel refuses to build a commit whose Git
   author is not a member of the Vercel account. The symptom is identical to
   trap 3 — instant `BLOCKED`, no build logs — but the cause is the commit's
   `author email`, not usage limits. Compare the author of a deployment that
   built against one that did not; if they differ, either set
   `git config user.email` to the address on the Vercel account, or add the
   other address as a member. A commit pushed by a tool or a second GitHub
   account is the usual way this happens.
5. **Cron frequency.** See the operating note below — Hobby rejects anything
   more frequent than daily.

Until `DATABASE_URL` and the Stripe keys are set, the landing page renders but
every database-backed route answers `503` and `/api/health` reports exactly
which variable is missing. That is the intended behaviour, not a broken deploy.

---

## How an order runs itself

```
customer pastes VAT numbers
  │  client + server parse and price with the same pure module
  ▼
POST /api/orders ──▶ rate limit ─▶ validate ─▶ price ─▶ order (awaiting_payment)
  │                                                      + Stripe Checkout Session
  ▼
Stripe Checkout  ──▶ customer pays ──▶ webhook (signature verified, event id claimed once)
  │                                      └─▶ order -> paid, ledger: +charge, -stripe_fee
  ▼
fulfillment pass (order-level lease, resumable, time-budgeted)
  │  per row: VIES call with requester identity
  │    answer  -> row terminal (valid / invalid)  ← both are billable answers
  │    transient failure -> exponential backoff, retried on the next pass
  │    8 attempts or permanent error -> dead letter
  ▼
all rows terminal
  ├─ none failed        -> fulfilled
  ├─ some failed        -> Stripe refund (pro rata, idempotent) -> partially_refunded
  └─ all failed         -> full refund                          -> refunded_failed
  ▼
PDF + CSV generated on demand from the database at /r/<token>
```

Three independent triggers drive fulfillment, and the order-level lease makes
overlap harmless:

1. the **Stripe webhook** starts the first pass right after returning its 200;
2. the customer's **result page**, which polls its own status endpoint;
3. the **hourly cron** sweep, which also expires abandoned checkouts, retries
   stalled orders and purges data past its retention window.

If all three fail, nothing is lost: the order state and per-row attempt counters
live in Postgres, and the next pass resumes exactly where the last one stopped.

### Failure handling, concretely

| Situation | What happens without a human |
|---|---|
| A member state's VIES node is offline (`MS_UNAVAILABLE`) | Row retried with exponential backoff (30 s → ~32 min), up to 8 attempts (~1 h) |
| Still offline after 8 attempts | Row dead-lettered, its share of the payment refunded automatically, order settles as `partially_refunded` |
| VIES rejects the input permanently | No retries; refunded immediately |
| Stripe refund API is down | The pass throws, the order stays `processing`, the obligation stays recorded, the next pass settles it. A refund is never double-issued (stable Stripe idempotency key + unique ledger reference) |
| Webhook delivered twice | Second delivery is a no-op (`webhook_events` primary key) |
| Customer double-submits the form | Same idempotency key returns the first response; no second order, no second Checkout Session |
| Customer closes the tab | The order URL is permanent; cron finishes the work regardless |
| Function times out mid-batch | Each row is persisted as it resolves; the next pass continues |

### What is deliberately absent

No login, no dashboard, no accounts, no emails sent by this service, no object
storage, no queue, no cache, no AI, no analytics. The order URL is the only
credential; the PDF and CSV are regenerated from Postgres on every request. The
only external API is VIES.

---

## Repository map

```
src/lib/vat.ts          VAT number parsing for all 27 member states + XI
src/lib/pricing.ts      pure pricing + pro-rata refund maths
src/lib/state.ts        order state machine; illegal transitions throw
src/lib/vies.ts         the one external API, with transient/permanent classification
src/lib/fulfillment.ts  the runner: lease, retry, dead letter, refund, settle
src/lib/store.ts        data-access contract (Postgres in prod, in-memory in tests)
src/lib/store-pg.ts     the production SQL
src/lib/evidence.ts     canonical result set, SHA-256 seal, CSV, PDF
src/lib/stripe.ts       checkout, refunds, true fee lookup for the ledger
src/app/api/…           orders, status, stripe webhook, cron, health, downloads
db/migrations/          schema, applied by scripts/migrate.ts
tests/                  117 tests; see below
```

### Ledger

`ledger_entries` is append-only and signed: `charge` positive, `stripe_fee` and
`refund` negative. Margin for any order — or for the whole business — is a single
`SUM(amount_minor)`.

```sql
SELECT
  date_trunc('day', created_at) AS day,
  SUM(amount_minor) FILTER (WHERE kind = 'charge')     / 100.0 AS revenue,
  SUM(amount_minor) FILTER (WHERE kind = 'stripe_fee') / 100.0 AS fees,
  SUM(amount_minor) FILTER (WHERE kind = 'refund')     / 100.0 AS refunds,
  SUM(amount_minor)                                    / 100.0 AS margin
FROM ledger_entries GROUP BY 1 ORDER BY 1 DESC;
```

---

## Development and verification

```bash
npm install
npm run lint        # eslint, zero warnings
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test            # 83 tests with no external dependencies
npm run build       # migrations (skipped without DATABASE_URL) + next build
npm run verify      # all of the above
```

Two further suites opt in through environment variables:

```bash
# Runs the real production SQL and the real HTTP handlers against a Postgres.
createdb vatproof_test
TEST_DATABASE_URL="postgres://localhost/vatproof_test" npm test   # 117 tests

# Checks the live VIES contract has not changed (hits the European Commission).
RUN_LIVE_VIES=1 npm test
```

What the tests actually cover: tier pricing and refund arithmetic; every legal
and illegal order transition; VIES error classification and timeout handling;
Stripe webhook signature verification (valid, tampered, wrong secret, replayed,
missing) and event-id idempotency; the fulfillment runner against transient
failures, permanent failures, attempt ceilings, concurrent passes, unpaid
orders, and a Stripe outage mid-refund; evidence seal determinism and CSV
formula-injection escaping; and — against real Postgres — the complete path from
`POST /api/orders` through a signed webhook to an automatically refunded,
delivered order.

---

## Operating notes

- **Its own schema.** Every table lives in the `vatproof` schema, not `public`.
  If you point `DATABASE_URL` at a database another application already uses,
  nothing collides — and `CREATE TABLE IF NOT EXISTS` cannot silently adopt a
  foreign table that happens to be called `orders` or `rate_limits`. If an
  earlier deploy of this app created tables in `public`, they are orphaned and
  safe to drop once you have checked nothing else owns them.
- **Data retention.** `DATA_RETENTION_DAYS` (default 90) after an order is
  placed, VAT numbers and trader details are erased by the cron sweep and the
  results stop being retrievable. Ledger rows survive, without identifying data.
- **Vercel cron frequency.** `vercel.json` ships a daily sweep (`0 3 * * *`)
  because the Hobby plan **rejects any cron schedule more frequent than once a
  day at deploy time**. On Pro, change it to `0 * * * *` and raise
  `maxDuration` in `src/app/api/cron/reconcile/route.ts` from 60 to 300 — that
  turns the recovery net from daily into hourly. It only matters for orders
  whose customer closed the tab *and* whose webhook pass hit a VIES outage;
  the webhook and result-page triggers cover everything else.
- **VIES throttling.** Raising `VIES_MAX_CONCURRENCY` above ~6 tends to produce
  `MS_MAX_CONCURRENT_REQ`, which costs retries, not money. The default is 4.
- **Scaling the upstream is free.** Cost per order is a Stripe fee and nothing
  else, so margin per order improves with basket size, not with volume.
