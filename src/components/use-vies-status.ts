"use client";

import { useEffect, useState } from "react";
import type { ViesStatus } from "@/lib/vies-status";

/**
 * One shared read of /api/status per page view, however many components ask.
 * The endpoint is cached for a minute at the edge, so polling here is cheap
 * for us and invisible to VIES.
 */
const FRESH_MS = 60_000;
let inflight: Promise<ViesStatus | null> | null = null;
let fetchedAt = 0;

function load(force = false): Promise<ViesStatus | null> {
  if (!inflight || force || Date.now() - fetchedAt > FRESH_MS) {
    fetchedAt = Date.now();
    inflight = fetch("/api/status")
      .then((res) => (res.ok ? (res.json() as Promise<ViesStatus>) : null))
      .catch(() => null);
  }
  return inflight;
}

export function useViesStatus(initial: ViesStatus | null = null, options: { poll?: boolean } = {}): ViesStatus | null {
  const { poll = false } = options;
  const [status, setStatus] = useState<ViesStatus | null>(initial);

  useEffect(() => {
    let alive = true;
    const apply = (next: ViesStatus | null) => {
      if (alive && next) setStatus(next);
    };
    if (!initial) void load().then(apply);
    if (!poll) {
      return () => {
        alive = false;
      };
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true).then(apply);
    }, FRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [initial, poll]);

  return status;
}
