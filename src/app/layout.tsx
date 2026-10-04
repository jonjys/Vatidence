import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteAnalytics } from "@/components/site-analytics";
import { SiteHeader } from "@/components/site-header";
import { CONTACT, OPERATOR_TAX_STATUS } from "@/lib/contact";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Google renders roughly 60 characters of a title and about 155 of a
// description. The previous pair overran both: the title was cut mid-phrase at
// "official VIES consultation...", and the description opened with "pay per
// row" - so the second thing a stranger read in the results was the word pay,
// from a snippet written before the free check existed. The snippet is the
// only advertisement this site has; it should lead with the thing anyone can
// do without deciding to trust it first.
const TITLE = "Vatidence - bulk EU VAT checks with VIES consultation numbers";
const DESCRIPTION =
  "Check one EU VAT number free, instantly. Or verify a whole list and get every VIES consultation number in a sealed PDF and CSV. No account.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // Inner pages name themselves ("Contact") and get the brand appended, so a
  // search result for the status page reads "Is VIES down? … · Vatidence".
  title: { default: TITLE, template: "%s · Vatidence" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  // Google Search Console ownership proof. Not a secret - it is served in the
  // page HTML by design, and only proves control of this domain.
  verification: { google: "vzFR7CpqG-nVc25MDUDBN5dUSuT8mGk8HpfKrinObPU" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Vatidence",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#f6f0e6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div>
              <Logo />
              <p className="footer-tag">Bulk EU VAT checks, with the consultation number.</p>
              <p className="byline">
                A product by{" "}
                <a href={CONTACT.operatorUrl} rel="noopener">
                  {CONTACT.operator}
                </a>
                , {CONTACT.country}. {OPERATOR_TAX_STATUS} Payments by Stripe. VAT numbers are checked against the
                European Commission&apos;s VIES service.
              </p>
            </div>
            <nav className="footlinks" aria-label="Site">
              <Link href="/">Home</Link>
              <Link href="/#pricing">Pricing</Link>
              <Link href="/vies-status">VIES status</Link>
              <Link href="/vat-number-formats">VAT number formats</Link>
              <Link href="/ai-plugin">AI plugin</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/refunds">Refunds</Link>
              <Link href="/privacy">Privacy</Link>
              <a href={CONTACT.operatorUrl} rel="noopener">
                nyttolabs.com
              </a>
            </nav>
          </div>
        </footer>
        <SiteAnalytics />
      </body>
    </html>
  );
}
