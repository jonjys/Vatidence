"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

/**
 * One header for every page, in the Nytto Labs product style: sticky, and it
 * tightens with a hairline once the page scrolls. The section links are plain
 * "/#…" anchors so they work from the order and legal pages as well.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-header" data-scrolled={scrolled ? "true" : "false"}>
      <div className="wrap header-row">
        <Logo />
        <nav className="site-nav" aria-label="Vatidence">
          <Link href="/#how">How it works</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#evidence">Evidence pack</Link>
          <Link href="/vies-status">VIES status</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>
        <Link href="/#order" className="btn btn-sm">
          Verify a list <span className="arrow" aria-hidden="true">→</span>
        </Link>
      </div>
    </header>
  );
}
