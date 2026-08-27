import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const TITLE = "VATProof - EU VAT numbers verified in bulk, with official VIES consultation numbers";
const DESCRIPTION =
  "Upload a list of EU VAT numbers, pay per row, get every official VIES consultation number plus a sealed PDF and CSV evidence pack. No account, no subscription.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "VATProof",
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
