/**
 * Customer-facing copy when POST /api/orders does not start checkout.
 *
 * A 502/503 here is almost never "your internet is down": Vercel or Stripe
 * can return HTML, JSON without a message, or a generic body. The customer
 * must hear two things — nothing was charged, and they should try again —
 * rather than a blank failure or "Network error".
 */

export const CHECKOUT_NOT_STARTED =
  "Checkout could not be started. You have not been charged. Please try again in a moment.";

export const CHECKOUT_UNAVAILABLE =
  "The service is temporarily unavailable. You have not been charged. Please try again.";

export const CHECKOUT_NETWORK =
  "Could not reach the server. You have not been charged. Check your connection and try again.";

export function messageFromErrorBody(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message.trim();
  }
  return null;
}

export function checkoutErrorMessage(status: number, body: unknown): string {
  const fromBody = messageFromErrorBody(body);

  if (status === 429) {
    return fromBody ?? "Too many orders from this address. Try again shortly.";
  }
  if (status === 503) {
    // Always the checkout wording: the shared 503 from guard() is also used
    // by the free check and does not mention payment.
    return CHECKOUT_UNAVAILABLE;
  }
  if (status >= 500) {
    return CHECKOUT_NOT_STARTED;
  }
  return fromBody ?? "Could not start checkout. Please try again.";
}

export async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
