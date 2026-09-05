import { CONTACT, OPERATOR_IDENTITY } from "@/lib/contact";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const config = env();
  return (
    <>
      <h1>Privacy</h1>
      <p className="lede">
        The service is built so there is very little to protect: there are no accounts, no profiles and no marketing.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>The VAT identification numbers submitted, and your own VAT number as the requester. These are business identifiers.</li>
        <li>The answers VIES returned: validity, consultation number, timestamp, and any registered trader name and address the member state published.</li>
        <li>Order and payment references, amounts and refunds, for accounting.</li>
        <li>A salted hash of the submitting IP address, used only for rate limiting and abuse prevention. The address itself is never stored.</li>
      </ul>

      <h2>What is not stored</h2>
      <p>
        No card details (Stripe holds those), no email address in this service&apos;s own database, no cookies for
        tracking, no analytics and no third-party scripts. The order URL is the only credential; anyone holding it can
        read that order, so treat it as confidential.
      </p>

      <h2>Retention</h2>
      <p>
        Order records and results are erased {config.DATA_RETENTION_DAYS} days after the order is placed, at which point
        the results stop being retrievable. Financial ledger entries are kept without identifying data for statutory
        accounting periods.
      </p>

      <h2>Processors</h2>
      <ul>
        <li>Stripe — payment processing.</li>
        <li>Vercel — hosting.</li>
        <li>Neon — database hosting.</li>
        <li>The European Commission (VIES) — the VAT numbers submitted are sent there to be checked. That is the service.</li>
      </ul>

      <h2>Your rights and contact</h2>
      <p>
        For access, correction or erasure ahead of the retention window, write to{" "}
        <a href={`mailto:${CONTACT.email.privacy}`}>{CONTACT.email.privacy}</a> with the order URL.
      </p>
      <p>
        The controller is {OPERATOR_IDENTITY}, which operates {CONTACT.product} at{" "}
        <a href={CONTACT.productUrl}>viesproof.eu</a>. Data-protection requests reach a person fastest at the address
        above; anything else can go to <a href={`mailto:${CONTACT.email.general}`}>{CONTACT.email.general}</a>.
      </p>
    </>
  );
}
