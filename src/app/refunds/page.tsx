import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function RefundsPage() {
  const config = env();
  return (
    <>
      <h1>Refund policy</h1>
      <p className="lede">You are billed per answered VAT number. No answer, no charge — enforced by the software, not by asking.</p>

      <h2>Automatic refunds</h2>
      <p>
        Every row is retried against VIES on an escalating schedule. If a row still cannot be answered — typically
        because the member state&apos;s own system is offline — it is marked unverifiable and the amount paid for that
        row is refunded to the original card automatically, with no request required. If no row in an order can be
        answered, the entire order is refunded.
      </p>
      <p>
        The refund is calculated pro rata on the amount actually paid, including any minimum-order component, and is
        issued through Stripe. Card refunds normally appear within 5–10 business days.
      </p>

      <h2>What is not refunded</h2>
      <p>
        A result of &quot;not valid&quot; is an answer, and an answer is what you paid for — it is frequently the most
        valuable answer in the batch. Rows that could not be parsed as EU VAT numbers are rejected before payment and
        never charged in the first place.
      </p>

      <h2>Anything else</h2>
      <p>
        If an order failed in a way the automation did not catch, write to{" "}
        <a href={`mailto:${config.SUPPORT_EMAIL}`}>{config.SUPPORT_EMAIL}</a> with the order URL and it will be refunded.
      </p>
    </>
  );
}
