import Link from "next/link";
import { EvidencePreview } from "@/components/evidence-preview";
import { HeroScene } from "@/components/hero-scene";
import { CheckFlow, HeroCheck, OrderSlot } from "@/components/home-interactive";
import { PriceCalc } from "@/components/price-calc";
import { ViesDemo } from "@/components/vies-demo";
import { WelcomeBack } from "@/components/welcome-back";
import { CONTACT, OPERATOR_TAX_STATUS } from "@/lib/contact";
import { MINIMUM_ORDER_MINOR, TIERS, formatMinor, minimumFloorExplanation } from "@/lib/pricing";
import { SUPPORTED_COUNTRIES, type CountryCode } from "@/lib/vat";

export const dynamic = "force-static";

const COUNTRY_NAMES: Record<CountryCode, string> = {
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  EL: "Greece",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  HR: "Croatia",
  HU: "Hungary",
  IE: "Ireland",
  IT: "Italy",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MT: "Malta",
  NL: "Netherlands",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SE: "Sweden",
  SI: "Slovenia",
  SK: "Slovakia",
  XI: "Northern Ireland",
};

const arrow = (
  <span className="arrow" aria-hidden="true">
    →
  </span>
);

export default function HomePage() {
  return (
    <CheckFlow>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <WelcomeBack />
            <p className="kicker kicker-pill rise">
              <span className="dot" aria-hidden="true" />
              EU VAT · VIES · 27 member states
            </p>
            <h1 className="display rise" style={{ "--d": "60ms" } as React.CSSProperties}>
              Bulk EU VAT checks, with the <span className="mark">consultation number.</span>
            </h1>
            <p className="lead rise" style={{ "--d": "120ms" } as React.CSSProperties}>
              Paste a list, pay once, and get every VIES consultation number back in a sealed PDF and CSV — usually
              within seconds. Or check a single number free, right here.
            </p>
            <div className="rise" style={{ "--d": "180ms" } as React.CSSProperties}>
              <HeroCheck />
            </div>
            <ul className="hero-trust">
              <li>
                <span className="dot" aria-hidden="true" />
                No account
              </li>
              <li>
                <span className="dot" aria-hidden="true" />
                One-off payment, from {formatMinor(MINIMUM_ORDER_MINOR)}
              </li>
              <li>
                <span className="dot" aria-hidden="true" />
                Unanswered rows refunded automatically
              </li>
            </ul>
          </div>
          <HeroScene />
        </div>
      </section>

      <div className="ticker">
        <p className="sr-only">Covers every EU member state, plus Northern Ireland:</p>
        <div className="ticker-track">
          {[false, true].map((copy) => (
            <ul key={String(copy)} aria-hidden={copy ? "true" : undefined}>
              {SUPPORTED_COUNTRIES.map((code) => (
                <li key={code}>
                  <b>{code}</b>
                  {COUNTRY_NAMES[code]}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <section className="section section-dark" id="difference">
        <div className="wrap">
          <ViesDemo />
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap split narrow-left top">
          <div>
            <p className="kicker">How it works</p>
            <h2 className="h2">Three steps. No account.</h2>
          </div>
          <ol className="steps">
            <li>
              <p className="num">1</p>
              <h3>Paste your list</h3>
              <p>
                One per line, a CSV column, or a file. Duplicates are removed and never charged twice; lines that are
                not EU VAT numbers are skipped before you pay.
              </p>
            </li>
            <li>
              <p className="num">2</p>
              <h3>Pay once</h3>
              <p>
                Add your own VAT number, see the exact price, pay by card through Stripe. No subscription, nothing
                recurring.
              </p>
            </li>
            <li>
              <p className="num">3</p>
              <h3>Download the pack</h3>
              <p>
                Your order page fills in live as VIES answers. The PDF evidence pack and CSV are ready the moment every
                row resolves.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section" id="pricing" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <p className="kicker">Price</p>
          <h2 className="h2">Pay per number. Once.</h2>
          <p className="lead">
            The more you verify, the less each number costs. One payment, no recurring charge — and you are never billed
            for an answer you did not get.
          </p>

          <PriceCalc />

          <p className="kicker" style={{ marginTop: "3rem" }}>
            Tier rate per number
          </p>
          <ul className="tiers">
            {TIERS.map((tier, i) => {
              const from = i === 0 ? 1 : (TIERS[i - 1]?.upTo ?? 0) + 1;
              return (
                <li key={tier.upTo}>
                  <p className="range">
                    {Number.isFinite(tier.upTo) ? `${from.toLocaleString("en-GB")} – ${tier.upTo.toLocaleString("en-GB")}` : `${from.toLocaleString("en-GB")} and up`}
                  </p>
                  <p className="rate">{formatMinor(tier.unitMinor)}</p>
                  <p className="per">per number in this tier</p>
                </li>
              );
            })}
          </ul>
          <p className="price-floor">{minimumFloorExplanation()}</p>
          <p className="fine-print">
            One payment, no recurring charge. Small batches still pay {formatMinor(MINIMUM_ORDER_MINOR)}, so the
            effective rate can be higher than the tier until that floor is covered. Rows a member state cannot answer
            are <Link href="/refunds">refunded automatically</Link> — you are never billed for an answer you did not
            get.
          </p>
        </div>
      </section>

      <section className="section section-white" id="evidence">
        <div className="wrap split">
          <div>
            <p className="kicker">What you receive</p>
            <h2 className="h2">A pack you can file, not a screenshot.</h2>
            <ul className="receive">
              <li>
                <p className="n">01</p>
                <h3>PDF evidence pack</h3>
                <p>
                  One row per VAT number, with the VIES consultation number and timestamp — plus the registered name
                  and address when the member state discloses them (several, Germany included, disclose only
                  validity).
                </p>
              </li>
              <li>
                <p className="n">02</p>
                <h3>CSV of the same data</h3>
                <p>For your ledger or ERP import. Same rows, same order, same consultation numbers.</p>
              </li>
              <li>
                <p className="n">03</p>
                <h3>SHA-256 integrity seal</h3>
                <p>A seal over the result set, printed on every page of the PDF. Change one row and it no longer matches.</p>
              </li>
              <li>
                <p className="n">04</p>
                <h3>Same list, next period</h3>
                <p>
                  Registrations lapse between periods. Your order page re-runs the same list pre-filled, so re-checking
                  costs a click rather than a rebuild.
                </p>
              </li>
            </ul>
          </div>
          <EvidencePreview />
        </div>
      </section>

      <section className="section section-sand" id="start">
        <div className="wrap split order-split">
          <div className="order-aside">
            <p className="kicker">Verify a list</p>
            <h2 className="h2">Paste. Pay once. Get the pack.</h2>
            <p className="lead">
              Checked against the European Commission&apos;s VIES service with your own VAT number attached — that is
              how VIES issues a consultation number. A member state outage can delay a row, never the charge.
            </p>
            <div className="next-box">
              <p>What happens after you click Pay</p>
              <ol>
                <li>
                  <b>1</b>
                  <span>Stripe checkout opens. Card details never reach this service.</span>
                </li>
                <li>
                  <b>2</b>
                  <span>You land on your private order page, which fills in live as each number is verified.</span>
                </li>
                <li>
                  <b>3</b>
                  <span>Download the PDF and CSV. Keep the link: it is the only key to your results.</span>
                </li>
              </ol>
              <p className="fine">
                Operated by {CONTACT.operator}, {CONTACT.country}. {OPERATOR_TAX_STATUS}
              </p>
            </div>
          </div>
          <OrderSlot />
        </div>
      </section>

      <section className="section" id="faq">
        <div className="wrap split narrow-left top">
          <div>
            <p className="kicker">FAQ</p>
            <h2 className="h2">Questions, answered.</h2>
          </div>
          <div className="faq" style={{ marginTop: 0 }}>
            <details>
              <summary>Why do I need to enter my own VAT number?</summary>
              <div>
                <p>
                  Because that is what makes VIES issue a consultation number. Without a requester, VIES answers yes or
                  no and records nothing. With one, it returns a unique identifier recording who checked, which number,
                  and when. You can do the same on the VIES website one number at a time; Vatidence does it for the
                  whole list and hands you the result as a file.
                </p>
              </div>
            </details>
            <details>
              <summary>What if a member state&apos;s system is offline?</summary>
              <div>
                <p>
                  Those rows are retried automatically on an escalating schedule. If a row still cannot be answered, it
                  is marked unverifiable and what you paid for it is refunded to your card — no request needed. If no
                  row in an order can be answered, the whole order is refunded.
                </p>
              </div>
            </details>
            <details>
              <summary>Is a &ldquo;not valid&rdquo; result refunded?</summary>
              <div>
                <p>
                  No. &ldquo;Not valid&rdquo; is an answer, and often the most useful one in the batch. Lines that are
                  not EU VAT numbers at all are rejected before payment and never charged.
                </p>
              </div>
            </details>
            <details>
              <summary>Why are the name and address sometimes empty?</summary>
              <div>
                <p>
                  Several member states, Germany among them, disclose nothing beyond validity. The pack shows exactly
                  what VIES returned rather than filling the gap.
                </p>
              </div>
            </details>
            <details>
              <summary>Do I need an account?</summary>
              <div>
                <p>
                  No account, no login, no subscription. After checkout you land on a private order page; its link is
                  the only key to your results, so keep it. This browser also remembers your most recent order.
                </p>
              </div>
            </details>
            <details>
              <summary>Can I re-check the same list next quarter?</summary>
              <div>
                <p>
                  Yes. A consultation number evidences the day it was issued, and registrations are withdrawn between
                  periods. Your order page has a &ldquo;Run this same list again&rdquo; link that brings the whole list
                  back pre-filled.
                </p>
              </div>
            </details>
            <details>
              <summary>Who runs this?</summary>
              <div>
                <p>
                  {CONTACT.operator}, {CONTACT.country}. {OPERATOR_TAX_STATUS} Payments are processed by Stripe. See{" "}
                  <Link href="/contact">contact</Link>, <Link href="/terms">terms</Link> and{" "}
                  <Link href="/privacy">privacy</Link>.
                </p>
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: "3.5rem" }}>
        <div className="final">
          <h2 className="h2">Stop checking VAT numbers one tab at a time.</h2>
          <div className="final-row">
            <a href="#order" className="btn">
              Verify a list {arrow}
            </a>
            <p>
              From {formatMinor(MINIMUM_ORDER_MINOR)}. Rows VIES cannot answer are refunded automatically. No account.
            </p>
          </div>
        </div>
      </section>
    </CheckFlow>
  );
}
