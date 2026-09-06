/**
 * Labels and hints for the pay control and the Stripe line the customer sees.
 *
 * Live Stripe (2026-09): cs_live_* sessions at €4.90 are created, then expire
 * unpaid. Opening checkout works. Completing pay does not. The usual bounce is
 * a one-to-twelve-number batch that hits the floor — the page must say that
 * amount, and that the free yes/no is already finished, before they leave.
 */

import { MINIMUM_ORDER_MINOR, TIERS, firstCountWithoutMinimum, formatMinor, type Quote } from "@/lib/pricing";

export function payCtaLabel(input: {
  busy: boolean;
  hasBillableItems: boolean;
  requesterOk: boolean;
  totalMinor?: number;
  minimumApplied?: boolean;
}): string {
  if (input.busy) return "Opening checkout…";
  if (!input.requesterOk) return "Enter your VAT number to continue";
  if (!input.hasBillableItems) return "Add VAT numbers to continue";
  if (input.totalMinor !== undefined) {
    const amount = formatMinor(input.totalMinor);
    return input.minimumApplied ? `Pay ${amount} minimum` : `Pay ${amount}`;
  }
  return "Pay and verify";
}

export function payBlockedHint(input: { hasBillableItems: boolean; requesterOk: boolean }): string | null {
  const floor = formatMinor(MINIMUM_ORDER_MINOR);
  if (!input.requesterOk && !input.hasBillableItems) {
    return `Enter your own EU VAT number and add the numbers to verify. Minimum ${floor}. Unanswered rows are refunded.`;
  }
  if (!input.requesterOk) {
    return "VIES only issues consultation numbers when you identify yourself. Enter your own EU VAT number above — it is not billed as a row.";
  }
  if (!input.hasBillableItems) {
    return `Add at least one usable EU VAT number. Minimum order ${floor}, even for a single number.`;
  }
  return null;
}

/**
 * One sentence above Pay when a quote exists. People who reach Stripe already
 * clicked through; this is the last chance to say the floor out loud.
 */
export function stripeChargeNotice(q: Quote): string {
  if (q.minimumApplied) {
    const tier = formatMinor(TIERS[0]!.unitMinor);
    return `Stripe will charge ${formatMinor(q.totalMinor)} for ${q.itemCount} number${q.itemCount === 1 ? "" : "s"} — the ${formatMinor(MINIMUM_ORDER_MINOR)} minimum, not ${formatMinor(q.subtotalMinor)} at the ${tier} tier.`;
  }
  return `Stripe will charge ${formatMinor(q.totalMinor)} for ${q.itemCount} numbers. One-off.`;
}

export function checkoutProductDescription(itemCount: number, amountMinor: number): string {
  const base = "Consultation numbers from VIES, plus a PDF and CSV of the answers. Not tax advice.";
  if (amountMinor === MINIMUM_ORDER_MINOR && itemCount < firstCountWithoutMinimum()) {
    return `${formatMinor(MINIMUM_ORDER_MINOR)} minimum for ${itemCount} number${itemCount === 1 ? "" : "s"}. ${base}`;
  }
  return base;
}

export function checkoutSubmitMessage(resultUrl: string, itemCount: number, amountMinor: number, soldBy: string): string {
  const floorNote =
    amountMinor === MINIMUM_ORDER_MINOR && itemCount < firstCountWithoutMinimum()
      ? ` This charge is the ${formatMinor(MINIMUM_ORDER_MINOR)} minimum, not a per-number rate.`
      : "";
  return `Results appear at ${resultUrl} after payment.${floorNote} ${soldBy}`;
}

/** Where Stripe sends a customer who backs out of Checkout. */
export function checkoutCancelUrl(appUrl: string, publicToken: string): string {
  const origin = appUrl.replace(/\/+$/, "");
  return `${origin}/?relist=${encodeURIComponent(publicToken)}&canceled=1`;
}
