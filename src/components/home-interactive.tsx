"use client";

import { useState } from "react";
import { FreeCheck } from "@/components/free-check";
import { OrderForm } from "@/components/order-form";

/**
 * The free check and the paid batch are one flow, not two products: the free
 * answer hands its number straight to the batch that can prove it.
 */
export function HomeInteractive() {
  const [seed, setSeed] = useState<{ vatNumber: string; at: number } | null>(null);

  return (
    <>
      <FreeCheck onEscalate={(vatNumber) => setSeed({ vatNumber, at: Date.now() })} />
      <OrderForm seed={seed} />
    </>
  );
}
