"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { FreeCheck } from "@/components/free-check";
import { OrderForm, type OrderFormSeed } from "@/components/order-form";

/**
 * The free check and the paid batch are one flow, not two products: the free
 * answer hands its number straight to the batch that can prove it.
 *
 * They live in different sections of the page now (the check in the hero, the
 * batch further down), so the hand-off goes through a context instead of a
 * shared parent. The page itself stays a static server component and passes
 * its sections in as children.
 */
type Flow = { seed: OrderFormSeed | null; escalate: (vatNumber: string) => void };

const FlowContext = createContext<Flow | null>(null);

function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("HeroCheck and OrderSlot must be rendered inside <CheckFlow>");
  return flow;
}

export function CheckFlow({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<OrderFormSeed | null>(null);
  const value = useMemo<Flow>(
    () => ({ seed, escalate: (vatNumber) => setSeed({ vatNumber, at: Date.now() }) }),
    [seed],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function HeroCheck() {
  const { escalate } = useFlow();
  return <FreeCheck onEscalate={escalate} />;
}

export function OrderSlot() {
  const { seed } = useFlow();
  return <OrderForm seed={seed} />;
}
