import type { Metadata } from "next";
import Link from "next/link";
import { StatusBoard } from "@/components/status-board";
import { MINIMUM_ORDER_MINOR, formatMinor } from "@/lib/pricing";
import { fetchViesStatus } from "@/lib/vies-status";

// Regenerated at most once a minute: a fresh snapshot for every visitor,
// and never more than one request a minute to the Commission.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Is VIES down? Live status for every EU member state",
  description:
    "Live availability of the EU VIES VAT number check, member state by member state, straight from the European Commission. Refreshed every minute.",
  alternates: { canonical: "/vies-status" },
};

export default async function StatusPage() {
  const status = await fetchViesStatus();

  return (
    <div className="page page-wide">
      <p className="kicker">VIES status</p>
      <h1>Is VIES down right now?</h1>
      <p className="lede">
        Every EU VAT check is relayed by the European Commission to the member state&apos;s own system, and each of
        those can be offline on its own. This is VIES&apos;s live report of which ones are answering.
      </p>

      <StatusBoard initial={status} />

      <div className="status-actions">
        <Link href="/#check" className="btn">
          Check a number free <span className="arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/#order" className="btn btn-light">
          Verify a list
        </Link>
      </div>

      <h2>What &ldquo;not answering&rdquo; means</h2>
      <p>
        VIES holds no data of its own. When a member state&apos;s system is offline, every check of a number from that
        country fails, on the Commission&apos;s own website as well as here, usually with the error{" "}
        <code>MS_UNAVAILABLE</code>. Most outages last minutes. Some are planned maintenance, often at night or at the
        weekend. Numbers from every other member state can still be checked as normal.
      </p>

      <h2>Checking while a member state is down</h2>
      <p>
        A single free check of a number from that country will fail until it is back. A paid order does not have to
        wait for you: you can place it now, rows for the unavailable country are retried automatically on an escalating
        schedule, and any row that is never answered is refunded to your card without you asking. Orders start from{" "}
        {formatMinor(MINIMUM_ORDER_MINOR)}.
      </p>

      <h2>Where this comes from</h2>
      <p>
        From VIES&apos;s own status feed, shown as it is reported, never edited. &ldquo;No signal&rdquo; means VIES did
        not say either way. Vatidence is an independent service and is not affiliated with the European Commission.
      </p>
    </div>
  );
}
