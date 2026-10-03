import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NextRequest } from "next/server";
import { parseVat, parseVatList } from "@/lib/vat";
import { quote } from "@/lib/pricing";

export interface VatToolsBackend {
  check: (req: NextRequest) => Promise<Response>;
  order: (req: NextRequest) => Promise<Response>;
  status: (req: NextRequest, token: string) => Promise<Response>;
}

const result = (data: Record<string, unknown>, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
  structuredContent: data,
  isError,
});

/** Reuse the existing guarded routes: no alternate billing or VIES pathway. */
export function createVatServer(backend: VatToolsBackend, original: Request, baseUrl: string) {
  const server = new McpServer({ name: "vatidence", version: "1.0.0" }, {
    instructions: "Check EU VAT numbers with VIES. Single checks are free; batch PDF/CSV evidence is a one-off purchase from EUR 4.90. Quote first. Create checkout only after the user explicitly approves the exact quoted price. The human completes Stripe payment. Never claim tax advice, guaranteed deductibility, or that an invalid number is fraud. Order tokens are private bearer credentials; do not publish them.",
  });
  const request = (path: string, body?: unknown) => {
    const headers = new Headers();
    for (const key of ["x-forwarded-for", "x-real-ip"]) {
      const value = original.headers.get(key);
      if (value) headers.set(key, value);
    }
    if (body) headers.set("content-type", "application/json");
    return new NextRequest(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET", headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  };
  const safeCall = async (fn: () => Promise<Response>) => {
    try {
      const response = await fn();
      const data = await response.json() as Record<string, unknown>;
      return result(data, !response.ok);
    } catch {
      return result({ error: "Service temporarily unavailable. Retry later; do not assume a payment or check succeeded." }, true);
    }
  };
  server.registerTool("check_vat", {
    description: "Free live VIES check of ONE EU or Northern Ireland VAT number. Not a batch endpoint; no paid evidence or consultation number. An unavailable registry is not an invalid VAT number.",
    inputSchema: { vatNumber: z.string().min(3).max(32) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ vatNumber }) => safeCall(() => backend.check(request("/api/check", { vatNumber }))));

  server.registerTool("quote_vat_batch", {
    description: "Free local validation, deduplication and exact EUR quote for a VAT list. Does not contact VIES, create orders or take payment. Review rejected entries before checkout.",
    inputSchema: { vatNumbers: z.string().min(3).max(160000) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ vatNumbers }) => {
    const parsed = parseVatList(vatNumbers, 5001);
    if (!parsed.items.length || parsed.items.length > 5000) return result({ error: "Provide between 1 and 5000 valid, distinct VAT numbers." }, true);
    return result({ ...quote(parsed.items.length), vatNumbers: parsed.items.map(i => i.canonical), rejected: parsed.rejected,
      duplicates: parsed.duplicates, paymentRequired: true, paymentMode: "one-off", termsUrl: `${baseUrl}/terms`,
      note: "Only answered VIES rows are billable, including invalid VAT results. Unanswered rows are refunded under the published policy. This is not tax advice." });
  });

  server.registerTool("create_vat_checkout", {
    description: "Create a human-payable Stripe checkout link, NOT a charge. Use only after the user explicitly approves the batch and exact EUR quote. Reuse the same idempotencyKey when retrying the same purchase. A requester VAT number is required for VIES evidence.",
    inputSchema: {
      requesterVat: z.string().min(3).max(32),
      vatNumbers: z.array(z.string().min(3).max(32)).min(1).max(5000),
      expectedAmountMinor: z.number().int().positive(),
      consent: z.literal(true).describe("True only after explicit user approval of this exact purchase."),
      idempotencyKey: z.string().min(8).max(120),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ requesterVat, vatNumbers, expectedAmountMinor, idempotencyKey }) => {
    const parsed = parseVatList(vatNumbers.join("\n"), 5001);
    if (!parseVat(requesterVat).ok || parsed.rejected.length || !parsed.items.length || parsed.items.length > 5000) {
      return result({ error: "Invalid VAT input. Correct the list and requester VAT before creating checkout." }, true);
    }
    const price = quote(parsed.items.length);
    if (price.totalMinor !== expectedAmountMinor) return result({ error: "Price mismatch. Quote again and obtain approval of the updated amount.", ...price }, true);
    return safeCall(() => backend.order(request("/api/orders", { requesterVat,
      vatNumbers: parsed.items.map(i => i.canonical), idempotencyKey })));
  });

  server.registerTool("get_vat_evidence", {
    description: "Read a private order's progress and retrieve PDF/CSV links when ready. Poll sparingly. Checking a paid order may resume its already-paid processing; it never charges again. Never share the private order token publicly.",
    inputSchema: { orderToken: z.string().regex(/^[A-Za-z0-9_-]{32}$/) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ orderToken }) => safeCall(async () => {
    const response = await backend.status(request(`/api/orders/${orderToken}`), orderToken);
    const data = await response.json() as Record<string, unknown>;
    return Response.json({ ...data, ...(response.ok ? { resultUrl: `${baseUrl}/r/${orderToken}`,
      ...(data.downloadsReady ? { pdfUrl: `${baseUrl}/api/orders/${orderToken}/evidence.pdf`, csvUrl: `${baseUrl}/api/orders/${orderToken}/results.csv` } : {}) } : {}) }, { status: response.status });
  }));
  return server;
}
