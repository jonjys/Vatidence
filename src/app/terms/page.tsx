import type { Metadata } from "next";
import { CONTACT, OPERATOR_TAX_STATUS } from "@/lib/contact";
import { env } from "@/lib/env";
import { MINIMUM_ORDER_MINOR, formatMinor } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "One-off VIES verification. No subscription. Minimum order €4.90. Unanswered rows refunded.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const config = env();
  return (
    <>
      <h1>Terms of service</h1>
      <p className="lede">Short, because the service is short.</p>

      <h2>1. What is sold</h2>
      <p>
        A one-off batch verification of EU VAT identification numbers against the European Commission&apos;s VIES
        service, delivered as a PDF evidence pack and a CSV file. Each order is a single purchase. There is no
        subscription, no account and no recurring charge.
      </p>

      <h2>2. Price and payment</h2>
      <p>
        The price is shown before payment and is calculated solely from the number of VAT numbers in the order, with a
        minimum order of {formatMinor(MINIMUM_ORDER_MINOR)}. Payment is processed by Stripe; card details are never
        seen or stored by this service.
      </p>

      <h2>3. Delivery</h2>
      <p>
        Delivery is automatic and immediate: results appear at the order URL shown at checkout as each number is
        verified. Keep that URL — it is the only way to reach your results, and it is retrievable for{" "}
        {config.DATA_RETENTION_DAYS} days.
      </p>

      <h2>4. What is and is not guaranteed</h2>
      <p>
        VIES answers are relayed exactly as the European Commission returns them, including the consultation number,
        timestamp and any registered trader name. This service does not verify, correct or interpret those answers, and
        provides no tax, legal or accounting advice. A &quot;valid&quot; result is a statement about a VAT
        identification number at a point in time, nothing more.
      </p>
      <p>
        VIES is operated by the European Commission and individual member state systems go offline without notice. Rows
        that cannot be answered are retried automatically and refunded if they remain unanswerable — see the refund
        policy.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Verify VAT numbers you have a legitimate business reason to verify. Automated bulk resale of this service,
        attempts to circumvent rate limits, and any use that would breach the European Commission&apos;s conditions for
        VIES are not permitted, and such orders may be refunded and refused.
      </p>

      <h2>6. Liability</h2>
      <p>
        Liability for any order is limited to the amount paid for that order. Nothing here limits liability that cannot
        be limited by law.
      </p>

      <h2>7. Contact</h2>
      <p>
        {CONTACT.product} is operated by {CONTACT.operator} (<a href={CONTACT.operatorUrl}>nyttolabs.com</a>), a{" "}
        {CONTACT.legalForm} operated by {CONTACT.operatedBy}. {OPERATOR_TAX_STATUS}
      </p>
      <ul>
        <li>
          General enquiries — <a href={`mailto:${CONTACT.email.general}`}>{CONTACT.email.general}</a>
        </li>
        <li>
          An order that misbehaved — <a href={`mailto:${CONTACT.email.support}`}>{CONTACT.email.support}</a>
        </li>
        <li>
          Payments, refunds and invoices — <a href={`mailto:${CONTACT.email.billing}`}>{CONTACT.email.billing}</a>
        </li>
        <li>
          Data protection — <a href={`mailto:${CONTACT.email.privacy}`}>{CONTACT.email.privacy}</a>
        </li>
      </ul>
    </>
  );
}
