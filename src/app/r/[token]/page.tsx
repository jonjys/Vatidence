import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultLive, type StatusPayload } from "@/components/result-live";
import { errorMessage, log } from "@/lib/log";
import { formatMinor } from "@/lib/pricing";
import { isTerminal } from "@/lib/state";
import { store } from "@/lib/store-pg";

export const dynamic = "force-dynamic";

// The token in this URL is the only credential protecting the order. Search
// engines must not keep a copy of it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const search = await searchParams;

  // This is the page a customer lands on straight after paying. If the database
  // is briefly unreachable it must say so plainly rather than show an error
  // page - the order itself is unaffected and the link stays valid.
  let order;
  try {
    order = await store.getOrderByToken(token);
  } catch (e) {
    log.error("result_page.unavailable", { error: errorMessage(e) });
    return (
      <>
        <h1>Order {token.slice(0, 10)}</h1>
        <p className="error">
          We cannot reach our database at this moment. Your order is unaffected: verification continues in the
          background and any payment is safe. Reload this page shortly.
        </p>
        <p className="hint mono">Permanent link to this order: /r/{token}</p>
      </>
    );
  }
  if (!order) notFound();

  const counts = await store.countItems(order.id);
  const answered = counts.valid + counts.invalid;
  const done = isTerminal(order.status);

  const initial: StatusPayload = {
    status: order.status,
    done,
    purged: order.purgedAt !== null,
    counts: {
      total: counts.total,
      answered,
      valid: counts.valid,
      invalid: counts.invalid,
      unverifiable: counts.failed,
      pending: counts.pending,
    },
    progress: counts.total === 0 ? 0 : Math.round(((counts.total - counts.pending) / counts.total) * 100),
    money: {
      amountTotal: formatMinor(order.amountTotal, order.currency),
      amountRefunded: formatMinor(order.amountRefunded, order.currency),
      amountRefundedMinor: order.amountRefunded,
    },
    downloadsReady: done && order.status !== "expired" && order.purgedAt === null,
    retrievableUntil: order.purgeAfter.toISOString(),
  };

  const canceled = search.canceled === "1";

  return (
    <>
      <h1>Order {token.slice(0, 10)}</h1>
      <p className="lede">
        {order.itemCount} VAT number{order.itemCount === 1 ? "" : "s"} · requester {order.requesterCountry}
        {order.requesterVat === "(purged)" ? "" : order.requesterVat}
      </p>

      {canceled && order.status === "awaiting_payment" ? (
        <p className="notice">Checkout was cancelled, so nothing was charged and nothing was verified.</p>
      ) : null}

      {order.purgedAt ? (
        <p className="notice">
          This order is past its data retention window and the underlying records have been erased. The ledger entry
          remains for accounting purposes.
        </p>
      ) : (
        <ResultLive token={token} initial={initial} />
      )}

      <p className="hint mono">Permanent link to this order: /r/{token}</p>
    </>
  );
}
