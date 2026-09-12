import Link from "next/link";
import { HomeInteractive } from "@/components/home-interactive";
import { MINIMUM_ORDER_MINOR, TIERS, formatMinor, minimumFloorExplanation } from "@/lib/pricing";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <>
      <div className="hero">
        <h1>Bulk EU VAT checks, with the consultation number.</h1>
        <p className="lede">
          Checked against the European Commission&apos;s VIES service with your own VAT number attached — that is how
          VIES issues a consultation number, recording who checked which number and when. Sealed PDF and CSV as soon as
          every row resolves, usually within seconds — a member state outage can delay a row, never the charge.
        </p>
      </div>

      <HomeInteractive />

      <ul className="specs">
        <li>27 member states</li>
        <li>Consultation number</li>
        <li>PDF + CSV</li>
        <li>No account</li>
      </ul>

      <h2>Why the consultation number matters</h2>
      <p>
        Checking a VAT number on the VIES website without entering your own VAT number returns a yes/no and nothing else.
        Enter your own number and VIES returns a unique consultation number that records who checked, which number, and
        when — VIES itself will give you this for a single lookup. This service always sends the requester identity, so
        every paid row includes that number without you typing it in by hand. The value on top of the free VIES site is
        doing that for a whole list at once and getting back a sealed, importable record instead of one screen at a time.
      </p>

      <h2>Price</h2>
      <p className="price-floor">{minimumFloorExplanation()}</p>
      <table>
        <thead>
          <tr>
            <th>VAT numbers</th>
            <th>Tier rate per number</th>
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
        One payment, no recurring charge. Small batches still pay {formatMinor(MINIMUM_ORDER_MINOR)}, so the effective
        rate can be higher than the tier until that floor is covered. Rows a member state cannot answer are{" "}
        <Link href="/refunds">refunded automatically</Link> — you are never billed for an answer you did not get.
      </p>

      <h2>What you receive</h2>
      <ul>
        <li>
          A PDF evidence pack: one row per VAT number, with the VIES consultation number and timestamp — plus the
          registered name and address when the member state discloses them (several, Germany included, disclose only
          validity).
        </li>
        <li>A CSV of the same data for your ledger or ERP import.</li>
        <li>A SHA-256 integrity seal over the result set, printed on every page of the PDF.</li>
      </ul>
    </>
  );
}
