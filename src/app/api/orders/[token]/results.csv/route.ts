import { loadDeliverable } from "@/lib/delivery";
import { toCsv } from "@/lib/evidence";
import { guard, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return guard("GET results.csv", () => download(ctx));
}

async function download(ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const result = await loadDeliverable(token);
  if (!result.ok) {
    return json({ error: result.reason }, result.status);
  }

  return new Response(toCsv(result.doc), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vies-results-${result.order.publicToken.slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
      "x-evidence-seal": result.seal,
    },
  });
}
