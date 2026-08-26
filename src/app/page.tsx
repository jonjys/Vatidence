import Link from "next/link";
import { OrderForm } from "@/components/order-form";
import { MINIMUM_ORDER_MINOR, TIERS, formatMinor } from "@/lib/pricing";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <>
      <h1>Verify a list of EU VAT numbers and get the official VIES consultation numbers.</h1>
      <p className="lede">
        Paste or upload your customer VAT numbers. Every one is checked against the European Commission&apos;s VIES
        service <strong>with your own VAT number attached</strong>, which is the only way VIES issues the consultation
        number tax authorities accept as proof. You get a sealed PDF evidence pack and a CSV, immediately after payment.
        No account, no subscription.
      </p>

      <OrderForm />

      <h2>Why the consultation number matters</h2>
      <p>
        Checking a VAT number on the VIES website without entering your own VAT number returns a yes/no and nothing else.
        Enter your own number and VIES returns a unique consultation number that records who checked, which number, and
        when. That identifier is what an auditor asks for when a zero-rated intra-EU invoice is questioned. Doing that by
        hand is roughly forty seconds per number, plus transcription into a spreadsheet.
      </p>

      <h2>Price</h2>
      <table>
        <thead>
          <tr>
            <th>VAT numbers</th>
            <th>Price per number</th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((tier, i) => {
            const from = i === 0 ? 1 : (TIERS[i - 1]?.upTo ?? 0) + 1;
            const to = Number.isFinite(tier.upTo) ? String(tier.upTo) : "and up";
            return (
              <tr key={tier.upTo}>
                <td>{Number.isFinite(tier.upTo) ? `${from} – ${to}` : `${from} and up`}</td>
                <td>{formatMinor(tier.unitMinor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        Minimum order {formatMinor(MINIMUM_ORDER_MINOR)}. One payment, no recurring charge. Rows a member state cannot
        answer are <Link href="/refunds">refunded automatically</Link> — you are never billed for an answer you did not
        get.
      </p>

      <h2>What you receive</h2>
      <ul>
        <li>A PDF evidence pack: one row per VAT number, with the VIES consultation number, timestamp and registered name.</li>
        <li>A CSV of the same data for your ledger or ERP import.</li>
        <li>A SHA-256 integrity seal over the result set, printed on every page of the PDF.</li>
      </ul>
    </>
  );
}
