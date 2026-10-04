"use client";

import { FreeCheck } from "@/components/free-check";

/**
 * The free check on a shared /check/<number> page. There is no batch form on
 * this page, so "add to a list" goes to the homepage's, carrying the number.
 */
export function SharedCheck({ vatNumber, autoRun }: { vatNumber: string; autoRun: boolean }) {
  return (
    <FreeCheck
      initialValue={vatNumber}
      autoRun={autoRun}
      onEscalate={(n) => {
        window.location.href = `/?add=${encodeURIComponent(n)}#order`;
      }}
    />
  );
}
