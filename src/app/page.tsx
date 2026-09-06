import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { HomeInteractive } from "@/components/home-interactive";
import { FAQ_EN } from "@/lib/faq";
import { MINIMUM_ORDER_MINOR, TIERS, formatMinor, minimumFloorExplanation } from "@/lib/pricing";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "VIESProof - VIES consultation numbers for accountants",
  description:
    "Check one EU VAT number free. Pay from €4.90 for VIES consultation numbers in a PDF and CSV. For accountants, bookkeepers and exporters — not tax advice.",
  alternates: { canonical: "/", languages: { en: "/", sv: "/sv" } },
};

export default function HomePage() {
  return (
    <>
      <div className="hero">
        <h1>VIES consultation numbers for accountants, bookkeepers and exporters.</h1>
        <p className="lede">
          When you zero-rate an intra-EU invoice, a tax authority can ask who checked the customer&apos;s VAT number,
          and when. VIES issues that identifier — a consultation number — only if you send your own VAT number with the
          check. This service always does. PDF and CSV of the answers, immediately. From{" "}
          {formatMinor(MINIMUM_ORDER_MINOR)}. The free check is the yes/no; you pay only for the consultation number.
        </p>
        <p className="audience">
          Built for reverse-charge files, period-end reviews and exporter customer lists — not for a one-off curiosity
          check. Try one number free; pay only when you need the consultation number, not another yes/no. This is not
          tax advice, and it is not a substitute for the Commission&apos;s own VIES site.
        </p>
      </div>

      <HomeInteractive />

      <ul className="specs">
        <li>27 member states</li>
        <li>Consultation number</li>
        <li>PDF + CSV</li>
        <li>From {formatMinor(MINIMUM_ORDER_MINOR)}</li>
        <li>No account</li>
      </ul>

      <h2>Why the consultation number matters</h2>
      <p>
        Checking a VAT number on the VIES website without entering your own VAT number returns a yes/no and nothing else.
        Enter your own number and VIES returns a unique consultation number that records who checked, which number, and
        when. This service always sends the requester identity, so the paid result includes that number. Doing that by
        hand is roughly forty seconds per number, plus transcription into a spreadsheet.
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
        <li>A PDF of each VIES answer: consultation number, timestamp, and registered name when the member state publishes one.</li>
        <li>A CSV of the same data for a spreadsheet or ERP import.</li>
        <li>A SHA-256 integrity seal over the result set, printed on every page of the PDF.</li>
      </ul>
      <p className="hint">
        Several member states, Germany among them, return no registered name or address — only validity and the
        consultation number. The pack is written so it still reads as a complete record in those cases.
      </p>

      <FaqList items={FAQ_EN} title="Questions accountants ask" headingId="faq-en" lang="en" />
    </>
  );
}
