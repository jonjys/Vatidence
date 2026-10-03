# Vatidence MCP plugin

EU VAT verification against VIES. Single checks free; human-approved batch
PDF/CSV evidence from EUR 4.90 per order. No subscription or automatic charge.

## Connect

Add `https://vatidence.nyttolabs.com/api/mcp` as a custom remote Streamable HTTP
MCP server in a compatible client. Client/account support varies. This package
contains portable plugin and MCP manifests, not a directory approval or listing.

For clients accepting standard server configuration:

```json
{"mcpServers":{"vatidence":{"url":"https://vatidence.nyttolabs.com/api/mcp"}}}
```

## Tools and purchase flow

1. `check_vat`: one free live VIES check, not automated batch scraping.
2. `quote_vat_batch`: paste a newline/comma/semicolon-separated list. Local
   validation, deduplication and exact EUR quote; no payment or external call.
3. Review rejected rows, accepted numbers, price and terms with the user.
4. After explicit approval, `create_vat_checkout`: requester VAT, accepted
   numbers, exact `expectedAmountMinor`, `consent: true`, and a stable 8–120
   character `idempotencyKey`. Reuse that key when retrying the same purchase.
5. User pays in Stripe. The tool creates a link, never an automatic charge.
6. `get_vat_evidence`: private `orderToken`, progress and PDF/CSV links when ready.
   Poll sparingly. Status can resume paid processing but never charge again.

Answered VIES rows, including invalid results, are billable. Unanswered rows
follow the existing refund policy. Consultation numbers are included where
supplied by VIES. Registry downtime is not an invalid VAT result. Not tax advice.

## Security and operation

- Reuses guarded API routes, rate limits, checkout idempotency and refund logic.
- Exact price matching and explicit-consent schema gate checkout creation.
- Tokens are bearer credentials. Never publish them or put them in public logs.
- No new database schema, cron, paid dependency or model API.
- Stateless JSON transport, 256 KiB limit, no JSON-RPC batches.
- Browser origins restricted to product, ChatGPT and Claude; no permissive CORS.
- Existing environment and deployment settings apply; see root README.

Installation/pricing: https://vatidence.nyttolabs.com/ai-plugin
Terms: https://vatidence.nyttolabs.com/terms
Privacy: https://vatidence.nyttolabs.com/privacy
