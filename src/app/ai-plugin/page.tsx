import type { Metadata } from "next";
import Link from "next/link";
import { MINIMUM_ORDER_MINOR, formatMinor, quote } from "@/lib/pricing";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "EU VAT verification MCP plugin | Vatidence",
  description: "Free single VIES VAT checks in MCP-compatible AI assistants. One-off batch PDF/CSV evidence from €4.90. No subscription; human-approved Stripe checkout.",
  alternates: { canonical: "/ai-plugin" },
};

export default function AiPluginPage() {
  const endpoint = `${siteUrl}/api/mcp`;
  const schema = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Vatidence MCP plugin",
    url: `${siteUrl}/ai-plugin`, applicationCategory: "BusinessApplication", operatingSystem: "Web",
    description: "EU and Northern Ireland VAT verification against VIES. Single checks free; paid batch PDF and CSV evidence. No subscription.",
    offers: { "@type": "Offer", price: (MINIMUM_ORDER_MINOR / 100).toFixed(2), priceCurrency: "EUR", description: "Minimum one-off batch evidence order; single checks are free." },
  };
  return <section className="section"><div className="wrap" style={{ maxWidth: 850 }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <p className="kicker">VAT verification · MCP plugin</p>
    <h1 className="display">Ask your AI. Get VAT evidence.</h1>
    <p className="lead">Check a single EU VAT number free. For a supplier list, get a price first, pay once, and retrieve timestamped PDF and CSV evidence in your workflow.</p>
    <h2>Free checks. Paid evidence. No subscription.</h2>
    <p>Batch evidence starts at {formatMinor(MINIMUM_ORDER_MINOR)} per order. A list of 100 distinct VAT numbers costs {formatMinor(quote(100).totalMinor)}. No automatic charge: you approve the quote and complete Stripe checkout yourself. Unanswered rows follow our <Link href="/refunds">refund policy</Link>.</p>
    <h2>Connect an MCP-compatible assistant</h2>
    <p>Add a custom remote Streamable HTTP server using this URL. No API key:</p>
    <pre style={{ overflowX: "auto", padding: 20 }}><code>{endpoint}</code></pre>
    <p>Availability depends on your client and account. This is a direct connection, not a claim of listing in any app directory.</p>
    <pre style={{ overflowX: "auto", padding: 20 }}><code>{JSON.stringify({ mcpServers: { vatidence: { url: endpoint } } }, null, 2)}</code></pre>
    <h2>What to ask</h2>
    <ul><li>“Check this supplier’s EU VAT number.”</li><li>“Validate this list and quote batch VAT evidence. Don’t create checkout yet.”</li><li>“I approve this quote. Create a payment link for the batch.”</li><li>“Retrieve my paid VAT report using this private order token.”</li></ul>
    <h2>Four focused tools</h2>
    <dl><dt><code>check_vat</code></dt><dd>One free live VIES check; no consultation number.</dd>
      <dt><code>quote_vat_batch</code></dt><dd>Local validation, deduplication and exact EUR price. No external request or payment.</dd>
      <dt><code>create_vat_checkout</code></dt><dd>A payment link after explicit approval, protected by price matching and idempotency.</dd>
      <dt><code>get_vat_evidence</code></dt><dd>Order progress and private PDF/CSV download links when ready.</dd></dl>
    <h2>Limits and privacy</h2>
    <p>EU member states and Northern Ireland only. Existing abuse limits apply. Registry downtime is not reported as an invalid VAT number. A result is not tax advice or a guarantee of tax exemption. Consultation numbers depend on the registry’s response.</p>
    <p>Your assistant sees submitted VAT numbers and retrieved results. Order links and tokens are private bearer credentials: anyone holding one can access the report. Never publish them. See our <Link href="/privacy">privacy notice</Link> and <Link href="/terms">terms</Link>.</p>
    <p><a href="https://github.com/jonjys/Vatidence/tree/main/plugins/vatidence">Plugin package and installation guide</a> · <Link href="/">Use Vatidence without an AI assistant</Link></p>
  </div></section>;
}
