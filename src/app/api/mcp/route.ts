import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { POST as check } from "@/app/api/check/route";
import { POST as order } from "@/app/api/orders/route";
import { GET as status } from "@/app/api/orders/[token]/route";
import { createVatServer } from "@/lib/mcp";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_BYTES = 256 * 1024;

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && ![siteUrl, "https://chatgpt.com", "https://claude.ai"].includes(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Expected application/json" }, { status: 415 });
  }
  const reader = req.body?.getReader();
  if (!reader) return Response.json({ error: "Missing body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  let parsedBody: unknown;
  try { parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  // JSON-RPC batches could fan out external calls: accept one request at a time.
  if (Array.isArray(parsedBody)) return Response.json({ error: "Batch requests are not supported" }, { status: 400 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createVatServer({ check, order, status: (r, token) => status(r, { params: Promise.resolve({ token }) }) }, req, siteUrl);
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req, { parsedBody });
    response.headers.set("cache-control", "private, no-store");
    return response;
  } finally {
    await server.close();
  }
}

// Stateless JSON responses: no long-lived SSE session or session deletion.
export async function GET() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
export async function DELETE() { return GET(); }
