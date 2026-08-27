# Working on this repo

VATProof: paid batch verification of EU VAT numbers against the European
Commission's VIES service, delivering official consultation numbers plus a
sealed PDF/CSV evidence pack. See README.md for what it does and why.

This file records the things that are not visible from the code and that cost
real time to discover.

## Deployment facts (Vercel, Hobby plan)

- **Commits must be authored by the Vercel account owner.** Vercel refuses to
  build a commit whose Git author is not a member of the account: the
  deployment goes straight to `BLOCKED` with no build logs, which looks
  identical to a usage-limit block. `.git/config` in a fresh clone does not
  carry this, so set it before committing:
  `git config user.email fkornelind@hotmail.com && git config user.name FRED`
- **Cron may not run more often than daily.** Hobby rejects anything finer at
  deploy time. `vercel.json` ships `0 3 * * *`.
- **`maxDuration` must be ≤ 60.** Anything higher fails the deploy on Hobby.
- **Deployment Protection must stay off.** It 302-redirects every visitor to a
  Vercel login, which no paying customer will get past.
- **Function region must match the Neon region.** An order is dominated by
  database round trips, not by VIES calls (those run concurrently). The Neon
  project is `aws-us-east-1`, so `vercel.json` pins `iad1`.
- Changing an environment variable does not affect deployments that already
  exist. Redeploy after editing one.

## Database facts (Neon)

- **The database is shared with the owner's other applications.** `public`
  already contains `Quote`, `MaterialBankItem`, `wallets`, `scans`,
  `api_usage`, and — critically — a `rate_limits` and a `webhook_events` that
  belong to another app.
- **Therefore: never use `public`.** Every table, index, trigger and the
  migration bookkeeping lives in the `vatproof` schema, and every statement is
  schema-qualified in SQL. There is no `search_path` to rely on. A bare
  `CREATE TABLE IF NOT EXISTS orders` would silently adopt a foreign table;
  that is exactly how production broke once.
- **Do not drop "leftover" tables in `public` by name.** Check the columns
  first. Two of the collision-named ones are another application's.
- The branch has a 512 MB logical size limit, shared across those apps. The
  cron sweep deletes unpaid expired orders for this reason.
- Stripe keys in production are **live**. A test purchase charges a real card.

## Stripe facts

- **Managed Payments is on by default for a new account and breaks checkout.**
  It makes Stripe the merchant of record for a 3.5% surcharge per transaction,
  and it is incompatible with `custom_text`: every `checkout.sessions.create`
  fails with `custom_text cannot be used with Managed Payments`, which surfaces
  as a 502 on `POST /api/orders`. Nothing in this repo changed to cause it -
  it arrived with a new Stripe account. `createCheckoutSession` therefore
  passes `managed_payments: { enabled: false }` on every session instead of
  trusting the account setting. The parameter is not in the pinned SDK's types
  (stripe 18.5.0), so it goes through a cast, with a fallback for API versions
  that reject it as unknown.
- **Switching Stripe accounts needs both keys and a redeploy.** A new
  `STRIPE_SECRET_KEY` without a matching `STRIPE_WEBHOOK_SECRET` is the worst
  case: checkout works, the webhook 400s on every event, and the order never
  leaves `awaiting_payment` - so the customer is charged, nothing is delivered,
  and the automatic refund never fires because that only covers paid orders.
- Refunds can only be issued from the account that took the payment, so orders
  taken before an account switch have to be settled from the old dashboard.

## How migrations work

`npm run build` runs `tsx scripts/migrate.ts --optional` before `next build`.
With `DATABASE_URL` set the migrations apply and a database that cannot be
migrated fails the build instead of shipping; without it, they are skipped so
local builds and CI work. Concurrent deploys serialise on a Postgres advisory
lock. There is no manual migration step in the deploy flow.

Migration files are checksummed after they are applied — never edit an applied
file, add a new one.

## What VIES will and will not do

Measured against the live service on 2026-08-27, because guessing here costs
weeks:

- **The qualified check is not available.** Sending `traderName`,
  `traderStreet`, `traderPostalCode`, `traderCity` and `traderCompanyType` to
  the REST API is accepted and answered with `NOT_PROCESSED` for every match
  field, in every member state tried (DE, NL, PL, SE, IE, DK, PT, LU, IT).
  Only the legacy SOAP endpoint (`checkVatApprox` at
  `/vies/services/checkVatService`) performs the match, and there only a
  minority of member states answer it — ES did, DE/NL/PL/SE/IE/DK/PT/LU/IT
  returned no match elements at all. So "the German
  *qualifizierte Bestätigungsabfrage* as a product" cannot be built on VIES;
  that service is the BZSt's own, not the Commission's. `tests/vies-live.test.ts`
  pins this so we find out if it ever changes.
- **The REST API has exactly two endpoints**: `POST /check-vat-number` and
  `GET /check-status`. There is no OpenAPI document, no member-state listing,
  and no other resource — everything else 404s.
- **`requestIdentifier` has no stable format.** Some member states return a
  UUID (`8ed996c1-28db-…`), others a short opaque token (`WAPIAAAAaBDiifgO`).
  Never validate its shape; store it verbatim.
- **`name` and `address` are frequently `---`.** Several member states,
  Germany among them, disclose nothing beyond validity. The evidence pack has
  to read well with those fields empty.

## Testing

```bash
npm run lint && npm run typecheck && npm test && npm run build   # npm run verify
```

Three suites, two of them opt-in:

- default: 83 tests, no external dependencies.
- `TEST_DATABASE_URL=postgres://…` adds the Postgres-backed suites: the real
  production SQL, and the whole HTTP money path from `POST /api/orders`
  through a signed Stripe webhook to an automatically refunded, delivered
  order. Run these before touching anything in `src/lib/store-pg.ts`,
  `src/lib/fulfillment.ts`, or the migrations.
- `RUN_LIVE_VIES=1` checks the upstream contract against the real European
  Commission service.

CI runs the build with `DATABASE_URL` set so `scripts/migrate.ts` itself is
exercised — the integration tests apply the migration SQL directly and would
otherwise never execute the runner.

## Invariants worth protecting

- Fulfillment never runs against an unpaid order; the state machine throws on
  an illegal transition rather than correcting it.
- A row that cannot be answered is refunded, never billed. "Not valid" is an
  answer and is billable.
- Refunds are idempotent through a stable Stripe idempotency key plus a unique
  ledger reference. A failed refund leaves the order in `processing` with the
  obligation intact rather than losing it.
- Nothing is deleted that ever produced a ledger entry.
- Revenue is never booked without its cost. `checkout.session.completed` and
  `charge.succeeded` are delivered in the same second and race each other, and
  Stripe creates the balance transaction asynchronously, so the fee webhook
  cannot be relied on alone. The cron sweep backfills any paid order older
  than five minutes that has no `stripe_fee` entry.
