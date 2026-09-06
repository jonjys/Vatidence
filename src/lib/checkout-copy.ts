/**
 * Labels and hints for the pay control. A disabled "Pay and verify" with no
 * explanation is how a first order dies: the list is ready, the requester VAT
 * is empty, and the customer thinks the product is broken.
 */

import { MINIMUM_ORDER_MINOR, formatMinor } from "@/lib/pricing";

export function payCtaLabel(input: {
  busy: boolean;
  hasBillableItems: boolean;
  requesterOk: boolean;
}): string {
  if (input.busy) return "Opening checkout…";
  if (!input.requesterOk) return "Enter your VAT number to continue";
  if (!input.hasBillableItems) return "Add VAT numbers to continue";
  return "Pay and verify";
}

export function payBlockedHint(input: { hasBillableItems: boolean; requesterOk: boolean }): string | null {
  const floor = formatMinor(MINIMUM_ORDER_MINOR);
  if (!input.requesterOk && !input.hasBillableItems) {
    return `Enter your own EU VAT number and add the numbers to verify. Minimum ${floor}. Unanswered rows are refunded.`;
  }
  if (!input.requesterOk) {
    return "VIES only issues consultation numbers when you identify yourself. Enter your own EU VAT number above.";
  }
  if (!input.hasBillableItems) {
    return `Add at least one usable EU VAT number. Minimum order ${floor}, even for a single number.`;
  }
  return null;
}

/** Where Stripe sends a customer who backs out of Checkout. */
export function checkoutCancelUrl(appUrl: string, publicToken: string): string {
  const origin = appUrl.replace(/\/+$/, "");
  return `${origin}/?relist=${encodeURIComponent(publicToken)}&canceled=1`;
}
