import { errorMessage, log } from "@/lib/log";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/**
 * Last line of defence for JSON endpoints. An unexpected failure - the database
 * being unreachable, most likely - must become a clean, logged 503 rather than
 * a stack trace rendered to a customer.
 */
export async function guard(route: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    log.error("route.unhandled", { route, error: errorMessage(e) });
    return json({ error: "service_unavailable", message: "The service is temporarily unavailable. Please try again." }, 503);
  }
}
