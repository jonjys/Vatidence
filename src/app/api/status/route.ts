import { fetchViesStatus } from "@/lib/vies-status";

/**
 * Member-state availability, as VIES reports it.
 *
 * Statically cached and regenerated at most once a minute, so however many
 * pages poll this, the Commission sees one request a minute from us. A failed
 * upstream read is a normal 200 with `reachable: false` - "we could not tell"
 * is a status too, and the page renders it.
 */
export const dynamic = "force-static";
export const revalidate = 60;

export async function GET(): Promise<Response> {
  return Response.json(await fetchViesStatus());
}
