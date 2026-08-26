import { loadDeliverable } from "@/lib/delivery";
import { toPdf } from "@/lib/evidence";
import { guard, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return guard("GET evidence.pdf", () => download(ctx));
}

async function download(ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const result = await loadDeliverable(token);
  if (!result.ok) {
    return json({ error: result.reason }, result.status);
  }

  const bytes = await toPdf(result.doc, new Date());
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="vies-evidence-${result.order.publicToken.slice(0, 10)}.pdf"`,
      "cache-control": "private, no-store",
      "x-evidence-seal": result.seal,
    },
  });
}
