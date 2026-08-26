/**
 * The narrow slice of Stripe the fulfillment runner is allowed to touch.
 * Keeping it to one method means the money-path tests can prove refund
 * behaviour without a Stripe account.
 */
export interface RefundGateway {
  refund(params: {
    paymentIntentId: string;
    amountMinor: number;
    idempotencyKey: string;
    reason: string;
  }): Promise<{ id: string }>;
}
