import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ check: vi.fn(), order: vi.fn(), status: vi.fn() }));
vi.mock("@/app/api/check/route", () => ({ POST: backend.check }));
vi.mock("@/app/api/orders/route", () => ({ POST: backend.order }));
vi.mock("@/app/api/orders/[token]/route", () => ({ GET: backend.status }));
const { POST, GET } = await import("@/app/api/mcp/route");

async function rpc(method: string, params?: unknown, extraHeaders?: Record<string, string>) {
  const response = await POST(new Request("http://localhost:3000/api/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": "192.0.2.1", ...extraHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  }));
  return { response, data: await response.json() };
}
const call = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });
const approved = { requesterVat: "DE123456789", vatNumbers: ["DE123456789"], expectedAmountMinor: 490, consent: true, idempotencyKey: "test-order-key-001" };

describe("stateless MCP HTTP API", () => {
  beforeEach(() => vi.resetAllMocks());
  it("initializes and exposes exactly four tools without touching services", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.response.status).toBe(200);
    expect(init.data.result.serverInfo.name).toBe("vatidence");
    const list = await rpc("tools/list");
    expect(list.data.result.tools.map((t: { name: string }) => t.name)).toEqual(["check_vat", "quote_vat_batch", "create_vat_checkout", "get_vat_evidence"]);
    expect(backend.check).not.toHaveBeenCalled();
    expect(backend.order).not.toHaveBeenCalled();
    expect(list.response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("quotes unique valid rows and reports bad rows without a paid API call", async () => {
    const { data } = await call("quote_vat_batch", { vatNumbers: "DE123456789\nDE123456789\ngarbage" });
    expect(data.result.structuredContent).toMatchObject({ itemCount: 1, totalMinor: 490, currency: "eur", paymentMode: "one-off" });
    expect(data.result.structuredContent.duplicates).toHaveLength(1);
    expect(data.result.structuredContent.rejected).toHaveLength(1);
    expect(backend.order).not.toHaveBeenCalled();
  });
  it("requires explicit consent and exact quote before checkout", async () => {
    for (const args of [{ ...approved, consent: false }, { ...approved, consent: undefined }, { ...approved, expectedAmountMinor: 491 }, { ...approved, vatNumbers: ["garbage"] }]) {
      const { data } = await call("create_vat_checkout", args);
      expect(data.result.isError).toBe(true);
    }
    expect(backend.order).not.toHaveBeenCalled();
  });
  it("forwards canonical numbers, retry key and IP to guarded checkout", async () => {
    backend.order.mockResolvedValue(Response.json({ checkoutUrl: "https://checkout.stripe.com/test" }, { status: 201 }));
    const { data } = await call("create_vat_checkout", { ...approved, vatNumbers: ["de123456789", "DE123456789"] });
    expect(data.result.isError).toBe(false);
    const req = backend.order.mock.calls[0]![0] as Request;
    expect(await req.json()).toEqual({ requesterVat: approved.requesterVat, vatNumbers: ["DE123456789"], idempotencyKey: approved.idempotencyKey });
    expect(req.headers.get("x-forwarded-for")).toBe("192.0.2.1");
  });
  it("preserves upstream rate limits and never exposes thrown secrets", async () => {
    backend.check.mockResolvedValueOnce(Response.json({ error: "Rate limit exceeded" }, { status: 429 }));
    expect((await call("check_vat", { vatNumber: "DE123456789" })).data.result.isError).toBe(true);
    backend.check.mockRejectedValueOnce(new Error("secret-database-password"));
    const { data } = await call("check_vat", { vatNumber: "DE123456789" });
    expect(JSON.stringify(data)).not.toContain("secret-database-password");
    expect(data.result.isError).toBe(true);
  });
  it("returns private download links only when ready; validates token", async () => {
    const token = "a".repeat(32);
    backend.status.mockResolvedValueOnce(Response.json({ downloadsReady: false, status: "pending" }));
    expect((await call("get_vat_evidence", { orderToken: token })).data.result.structuredContent.pdfUrl).toBeUndefined();
    backend.status.mockResolvedValueOnce(Response.json({ downloadsReady: true, status: "complete" }));
    expect((await call("get_vat_evidence", { orderToken: token })).data.result.structuredContent.pdfUrl).toContain(`/api/orders/${token}/evidence.pdf`);
    expect((await call("get_vat_evidence", { orderToken: "../../private" })).data.result.isError).toBe(true);
  });
  it("rejects browser cross-origin, malformed and oversized requests", async () => {
    expect((await rpc("tools/list", undefined, { origin: "https://evil.example" })).response.status).toBe(403);
    for (const [body, status] of [["{bad", 400], ["[]", 400], ["x".repeat(262145), 413]] as const) {
      const res = await POST(new Request("http://localhost:3000/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body }));
      expect(res.status).toBe(status);
    }
    expect((await GET()).status).toBe(405);
  });
});
