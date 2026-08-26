import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VATProof - EU VAT numbers verified in bulk, with official VIES consultation numbers",
  description:
    "Upload a list of EU VAT numbers, pay per row, get every official VIES consultation number plus a sealed PDF and CSV evidence pack. No account, no subscription.",
  robots: { index: true, follow: true },
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
