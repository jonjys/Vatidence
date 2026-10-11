import type { Metadata } from "next";
import Link from "next/link";
import { ExposureScan } from "@/components/exposure-scan";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Reverse-charge exposure scan: how much VAT rides on your customers' VAT numbers",
  description:
    "Drop a Stripe or accounting export and see, in seconds, how much VAT you would owe if the 0% on your EU B2B sales were refused, and which customer VAT numbers are malformed. Free, and the file never leaves your browser.",
  alternates: { canonical: "/exposure" },
};

export default function ExposurePage() {
  return (
    <div className="page page-wide">
      <p className="kicker">Free exposure scan</p>
      <h1>How much VAT rides on your customers&apos; VAT numbers?</h1>
      <p className="lede">
        Every EU sale you invoice at 0% under the reverse charge rests on one thing: the buyer&apos;s VAT number being
        valid. If a tax auditor finds it was not, or that you cannot show it was, the VAT is yours to pay. Drop your
        sales export and see the amount, customer by customer.
      </p>

      <div className="fmt-callouts">
        <p>
          <b>Stripe says &quot;verified&quot;.</b> Auditors ask for the VIES consultation number, and Stripe&apos;s check
          does not give you one.
        </p>
        <p>
          <b>Free and private.</b> The file is read in your browser and never uploaded.
        </p>
        <p>
          <b>30 seconds.</b> Columns are found for you. No account, no sign-up.
        </p>
      </div>

      <ExposureScan />

      <h2>Where to get the export</h2>
      <ul>
        <li>
          <b>Stripe:</b> Invoices (or Payments), filter to the period, Export, and include the customer tax ID column.
        </li>
        <li>
          <b>Accounting software:</b> a sales or customer-invoice report saved as CSV, with the customer VAT number and
          the amount.
        </li>
        <li>
          <b>A spreadsheet:</b> any sheet with a VAT number column, saved as CSV.
        </li>
      </ul>

      <h2>Why a number, not just a list</h2>
      <p>
        &quot;Check your customers&apos; VAT numbers&quot; is advice everyone agrees with and nobody acts on. What the
        scan shows instead is what not checking costs: the VAT a refused 0% would add to the sales in your own file. The
        malformed numbers are the certain part. The rest is what an official consultation number per customer protects.
      </p>
      <p>
        <Link href="/vat-number-formats">EU VAT number formats</Link> ·{" "}
        <Link href="/vies-status">Is VIES up right now?</Link> · <Link href="/#check">Check one number free</Link>
      </p>
    </div>
  );
}
