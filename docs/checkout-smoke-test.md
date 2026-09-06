# Checkout smoke test (dry / test — do not take a live card)

Production at https://viesproof.eu is on **Stripe live keys**. A real card
there is a real charge. This file is how to prove the pay path works
*without* creating the first customer by accident.

Live Stripe as of 2026-09: **Checkout Sessions at €4.90 (`cs_live_*`) are being
created, then expire unpaid.** Opening checkout works. Nobody has completed pay.
There are still **zero successful PaymentIntents**. The webhook → PDF path after
a real charge is therefore still unproven. Do not treat an expired €4.90 session
as a broken pay button, and do not invent a successful payment.

---

## 1. Is the live site even up?

```bash
curl -sS https://viesproof.eu/api/health
```

Expect `"ok": true` and `checks.env`, `checks.database`, `checks.vies` all ok.
Individual member states in `vies.detail` (e.g. `DE,LV`) going unavailable is
normal; that is a retry/refund concern, not a payment block.

If `ok` is false because `env` or `database` failed, **do not send anyone to
pay**. Checkout will 502/503 and they will think the product is dead.

---

## 2. Test-mode checkout (the only safe end-to-end)

Use a **preview or local** deploy whose `STRIPE_SECRET_KEY` starts with
`sk_test_` and whose `STRIPE_WEBHOOK_SECRET` is the matching test endpoint.

1. `npm run dev` with `.env` from `.env.example` (test keys only).
2. Open `/` (or `/sv`). Paste a format-valid VAT in “your own EU VAT number”
   (e.g. the public sample `DE811907980`) and load the example list, or type one number.
3. Confirm the live quote shows the **€4.90 minimum** for a small batch, and
   the pay button reads **Pay and verify** only once both fields are valid.
   If the requester VAT is empty the button must say **Enter your VAT number
   to continue** — that is the first-order leak this copy exists to close.
4. Click through. You should land on `checkout.stripe.com`.
5. Pay with Stripe’s test card `4242 4242 4242 4242`, any future expiry, any
   CVC, any name.
6. Stripe should redirect to `/r/<token>?paid=1`. The page should leave
   `Waiting for payment` and start verifying (or show results if VIES
   answered quickly).
7. Confirm PDF and CSV links appear when the order is terminal.

Webhook: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and
put that CLI secret in `STRIPE_WEBHOOK_SECRET`. Without it the charge can
succeed and the order stays `awaiting_payment` — the failure mode that takes
money and delivers nothing. On a test key you can refund from the Dashboard.

Cancel path: start checkout, click back. You should return to `/?relist=…&canceled=1`
with the list still in the form, not a dead `/r/…` page.

---

## 3. Production: prove the session starts, then stop

Do **not** complete a livemode payment for a smoke test.

```bash
# Should be 200 and name the missing piece if any:
curl -sS -o /tmp/vp-health.json -w '%{http_code}\n' https://viesproof.eu/api/health
```

Then, in a private window on https://viesproof.eu:

1. Free-check a known format-valid number (e.g. a public sample on the form).
2. Escalate to the paid form. Enter **your** VAT as requester (a real EU VAT
   you are allowed to send to VIES — this is forwarded to the Commission).
3. Click **Pay and verify**.
4. Confirm the next page is Stripe Checkout for about €4.90 (or the quoted
   total), statement-looking text mentions VIESProof / Nytto Labs, and the
   submit helper text has the `/r/…` result URL.
5. **Close the tab.** Do not pay. Abandoned live sessions expire and are
   deleted by cron; they must not become a charge.

If step 3 shows “Checkout could not be started. You have not been charged.”
the pay path is down. Usual causes, in the order they have actually bitten:

| Symptom | Likely cause | What to do |
|---|---|---|
| Instant Vercel login wall | Deployment Protection on | Turn it off; customers cannot pass it |
| 502 on Pay, site otherwise fine | Stripe Managed Payments vs `custom_text` | Code already opts out; check the live Stripe account setting and the function logs for `order.create_failed` |
| Checkout works, order never leaves `awaiting_payment` | `STRIPE_WEBHOOK_SECRET` does not match this Stripe account | Fix the secret and **redeploy**. Refund the customer from the Dashboard if they paid |
| Health `env` not ok | Missing `DATABASE_URL` / Stripe / `APP_URL` / `CRON_SECRET` | Set the variable and redeploy. Changing env does not patch an existing deployment |

---

## 4. What this repo’s tests already cover (no Stripe network)

```bash
npm test
```

Default suite: pricing floor, checkout error copy, pay-button labels, cancel
URL shape, webhook signature handling (fixtures). It does **not** create a
Checkout Session.

With `TEST_DATABASE_URL` set, the HTTP money path runs against a fake Stripe
and a real Postgres. Run that before touching `src/lib/store-pg.ts`,
`src/lib/fulfillment.ts`, or `src/lib/stripe.ts`.

There is no “dry run” flag in production that starts a session without
writing an `awaiting_payment` row. Do not add one on the live hostname.
