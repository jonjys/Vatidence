/**
 * Pricing is a pure function of row count. No price lists to maintain, no
 * supplier costs to track: the upstream (VIES) is free, so gross margin is
 * revenue minus the Stripe fee.
 */

export const CURRENCY = "eur";

/** Marginal price per row, in cents, by cumulative volume. */
export const TIERS: ReadonlyArray<{ upTo: number; unitMinor: number }> = [
  { upTo: 25, unitMinor: 39 },
  { upTo: 250, unitMinor: 19 },
  { upTo: 2000, unitMinor: 11 },
  { upTo: Number.POSITIVE_INFINITY, unitMinor: 7 },
];

/** Below this the order is not worth a Stripe fee. */
export const MINIMUM_ORDER_MINOR = 490;

export type Quote = {
  itemCount: number;
  subtotalMinor: number;
  totalMinor: number;
  minimumApplied: boolean;
  effectiveUnitMinor: number;
  currency: typeof CURRENCY;
};

export function quote(itemCount: number): Quote {
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    throw new Error(`itemCount must be a positive integer, received ${String(itemCount)}`);
  }

  let remaining = itemCount;
  let consumed = 0;
  let subtotalMinor = 0;

  for (const tier of TIERS) {
    if (remaining <= 0) break;
    const capacity = tier.upTo - consumed;
    const take = Math.min(remaining, capacity);
    subtotalMinor += take * tier.unitMinor;
    consumed += take;
    remaining -= take;
  }

  const minimumApplied = subtotalMinor < MINIMUM_ORDER_MINOR;
  const totalMinor = minimumApplied ? MINIMUM_ORDER_MINOR : subtotalMinor;

  return {
    itemCount,
    subtotalMinor,
    totalMinor,
    minimumApplied,
    effectiveUnitMinor: Math.round(totalMinor / itemCount),
    currency: CURRENCY,
  };
}

/**
 * Pro-rata refund for rows we could not answer, computed against what was
 * actually paid (so the minimum-order uplift is refunded too).
 *
 * Deterministic and clamped: a refund can never exceed what is left unrefunded,
 * and "every row failed" always means "refund everything".
 */
export function refundForFailedRows(params: {
  amountTotalMinor: number;
  amountRefundedMinor: number;
  totalRows: number;
  failedRows: number;
}): number {
  const { amountTotalMinor, amountRefundedMinor, totalRows, failedRows } = params;
  if (totalRows <= 0) return 0;
  if (failedRows <= 0) return 0;

  const capped = Math.min(failedRows, totalRows);
  const gross = capped >= totalRows ? amountTotalMinor : Math.round((amountTotalMinor * capped) / totalRows);
  const remaining = Math.max(0, amountTotalMinor - amountRefundedMinor);
  return Math.max(0, Math.min(gross, remaining));
}

export function formatMinor(minor: number, currency: string = CURRENCY): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);
}
