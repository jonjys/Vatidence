import { buildEvidence, sealOf, type EvidenceDocument } from "@/lib/evidence";
import { isTerminal } from "@/lib/state";
import { store } from "@/lib/store-pg";
import type { Order } from "@/lib/types";

export type DeliveryDenial = { ok: false; status: number; reason: string };
export type DeliveryGrant = { ok: true; order: Order; doc: EvidenceDocument; seal: string };

/**
 * A download is only served once the order is settled and inside the retention
 * window. Paid-but-unfinished orders return 409 so the client keeps polling.
 */
export async function loadDeliverable(token: string): Promise<DeliveryGrant | DeliveryDenial> {
  const order = await store.getOrderByToken(token);
  if (!order) return { ok: false, status: 404, reason: "Unknown order reference." };
  if (order.purgedAt) return { ok: false, status: 410, reason: "This order is past its data retention window." };
  if (order.status === "expired") return { ok: false, status: 402, reason: "This order was never paid." };
  if (!isTerminal(order.status)) {
    return { ok: false, status: 409, reason: "Verification is still running." };
  }

  const items = await store.listItems(order.id);
  const doc = buildEvidence(order, items);
  return { ok: true, order, doc, seal: sealOf(doc) };
}
