"use client";

import { useEffect, useState } from "react";

/**
 * The order form keeps the last result link in this browser so a closed tab is
 * never a lost order. Surface it on the way back in: a returning customer's
 * first click should be their results, not a fresh checkout.
 *
 * Read after mount only, so the static HTML never differs from the first
 * client render. Only a same-site /r/<token> path is ever linked.
 */
export function WelcomeBack() {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vatidence:last-result");
      if (!saved) return;
      const url = new URL(saved, window.location.origin);
      if (/^\/r\/[A-Za-z0-9_-]{6,64}$/.test(url.pathname)) setPath(url.pathname);
    } catch {
      // storage blocked or a malformed value: nothing to offer
    }
  }, []);

  if (!path) return null;
  return (
    <a className="welcome-back rise" href={path}>
      Welcome back <b>Open your last order →</b>
    </a>
  );
}
