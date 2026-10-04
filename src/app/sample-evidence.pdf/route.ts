import { toPdf } from "@/lib/evidence";
import { SAMPLE_EVIDENCE, SAMPLE_GENERATED_AT } from "@/lib/sample-evidence";

/** A real evidence pack built from invented data, rendered once at build time. */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const bytes = await toPdf(SAMPLE_EVIDENCE, SAMPLE_GENERATED_AT);
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="vatidence-sample-evidence.pdf"',
    },
  });
}
