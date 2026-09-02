import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Google renders roughly 60 characters of a title and about 155 of a
// description. The previous pair overran both: the title was cut mid-phrase at
// "official VIES consultation...", and the description opened with "pay per
// row" - so the second thing a stranger read in the results was the word pay,
// from a snippet written before the free check existed. The snippet is the
// only advertisement this site has; it should lead with the thing anyone can
// do without deciding to trust it first.
const TITLE = "VIESProof - bulk EU VAT checks with VIES consultation numbers";
const DESCRIPTION =
  "Check one EU VAT number free, instantly. Or verify a whole list and get every official VIES consultation number in a sealed PDF and CSV. No account.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  // Google Search Console ownership proof. Not a secret - it is served in the
  // page HTML by design, and only proves control of this domain.
  verification: { google: "vzFR7CpqG-nVc25MDUDBN5dUSuT8mGk8HpfKrinObPU" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "VIESProof",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <header className="masthead">
            <Link href="/" className="wordmark">
              VIES<span>Proof</span>
            </Link>
            <span className="kicker">EU VAT verification</span>
          </header>
          {children}
          <footer>
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/refunds">Refunds</Link>
            <Link href="/privacy">Privacy</Link>
          </footer>
        </main>
      </body>
    </html>
  );
}
