import { toCsv } from "@/lib/evidence";
import { SAMPLE_EVIDENCE } from "@/lib/sample-evidence";

/** The CSV half of the sample pack: the same rows, in the format a real order downloads. */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(toCsv(SAMPLE_EVIDENCE), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="vatidence-sample-evidence.csv"',
    },
  });
}
