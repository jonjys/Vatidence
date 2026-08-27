import Link from "next/link";
import { OrderForm } from "@/components/order-form";
import { MINIMUM_ORDER_MINOR, TIERS, formatMinor } from "@/lib/pricing";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <>
      <div className="hero">
        <h1>Bulk EU VAT checks, with the official proof.</h1>
        <p className="lede">
          Checked against the European Commission&apos;s VIES service with your own VAT number attached — the only way
          to get a consultation number an auditor accepts. Sealed PDF and CSV, immediately.
        </p>
        <ul className="specs">
          <li>27 member states</li>
          <li>Consultation number</li>
          <li>PDF + CSV</li>
          <li>No account</li>
        </ul>
      </div>

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
