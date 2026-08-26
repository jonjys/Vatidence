"use client";

import { useEffect, useState } from "react";

export type StatusPayload = {
  status: string;
  done: boolean;
  purged: boolean;
  counts: { total: number; answered: number; valid: number; invalid: number; unverifiable: number; pending: number };
  progress: number;
  money: { amountTotal: string; amountRefunded: string; amountRefundedMinor: number };
  downloadsReady: boolean;
  retrievableUntil: string;
};

const LABELS: Record<string, string> = {
  awaiting_payment: "Waiting for payment",
  paid: "Payment received — starting verification",
  processing: "Verifying against VIES",
  fulfilled: "Complete",
  partially_refunded: "Complete — partial refund issued",
  refunded_failed: "Could not be completed — fully refunded",
  refunded: "Refunded",
  expired: "Checkout expired — no payment taken",
};

export function ResultLive({ token, initial }: { token: string; initial: StatusPayload }) {
  const [state, setState] = useState<StatusPayload>(initial);

  useEffect(() => {
    if (state.done) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as StatusPayload;
        if (!cancelled) setState(next);
      } catch {
        // transient; the next tick retries
      }
    };
    const id = setInterval(() => void tick(), 3000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, state.done]);

  return (
    <>
      <div className="panel">
        <div className="row">
          <div>
            <strong>{LABELS[state.status] ?? state.status}</strong>
            <div className="hint">
              {state.counts.total - state.counts.pending} of {state.counts.total} numbers resolved
            </div>
          </div>
          <div className="price">{state.progress}%</div>
        </div>
        <div className="bar">
          <i style={{ width: `${state.progress}%` }} />
        </div>

        <div className="summary">
          <div className="stat">
            <div className="n ok">{state.counts.valid}</div>
            <div className="k">valid</div>
          </div>
          <div className="stat">
            <div className="n bad">{state.counts.invalid}</div>
            <div className="k">not valid</div>
          </div>
          <div className="stat">
            <div className="n warn">{state.counts.unverifiable}</div>
            <div className="k">unverifiable</div>
          </div>
          <div className="stat">
            <div className="n">{state.money.amountTotal}</div>
            <div className="k">paid</div>
          </div>
          {state.money.amountRefundedMinor > 0 ? (
            <div className="stat">
              <div className="n">{state.money.amountRefunded}</div>
              <div className="k">refunded</div>
            </div>
          ) : null}
        </div>

        {!state.done ? (
          <p className="hint">
            This page updates itself. Member states occasionally go offline; those rows are retried automatically and
            refunded if they stay unavailable. You can close this tab and come back to this URL.
          </p>
        ) : null}
      </div>

      {state.downloadsReady ? (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Your evidence pack</h2>
          <a className="dl" href={`/api/orders/${token}/evidence.pdf`}>
            Download PDF evidence pack
          </a>
          <a className="dl" href={`/api/orders/${token}/results.csv`}>
            Download CSV
          </a>
          <p className="hint">
            Retrievable from this URL until {new Date(state.retrievableUntil).toISOString().slice(0, 10)}, after which
            the underlying records are erased.
          </p>
        </div>
      ) : null}

      {state.money.amountRefundedMinor > 0 ? (
        <p className="notice">
          {state.counts.unverifiable} number{state.counts.unverifiable === 1 ? "" : "s"} could not be answered by the
          relevant member state, so {state.money.amountRefunded} has been refunded to your card automatically. It
          normally appears within 5–10 business days.
        </p>
      ) : null}
    </>
  );
}
