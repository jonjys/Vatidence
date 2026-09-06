/**
 * Remember the requester VAT in this browser so a cancelled €4.90 Stripe
 * session does not make them type it again. VIES needs that number; it is
 * the usual block after a free-check escalate. Never invent a VAT — only
 * persist a format-valid one they already typed.
 */

import { parseVat } from "@/lib/vat";

export const REQUESTER_VAT_STORAGE_KEY = "viesproof:requester-vat";

export function readRememberedRequesterVat(storage: Pick<Storage, "getItem"> | null | undefined): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REQUESTER_VAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseVat(raw);
    return parsed.ok ? parsed.value.canonical : null;
  } catch {
    return null;
  }
}

export function rememberRequesterVat(
  storage: Pick<Storage, "setItem"> | null | undefined,
  vat: string,
): void {
  if (!storage) return;
  const parsed = parseVat(vat);
  if (!parsed.ok) return;
  try {
    storage.setItem(REQUESTER_VAT_STORAGE_KEY, parsed.value.canonical);
  } catch {
    // private browsing / quota
  }
}
