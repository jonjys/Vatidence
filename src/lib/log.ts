type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[configured] ?? ORDER.info;
}

/**
 * Single-line JSON logs. Vercel ingests stdout as structured logs, so this is
 * the whole observability story - no extra SaaS.
 */
function emit(level: Level, msg: string, fields: LogFields = {}): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

/** Never log a full identifier we do not need in plaintext. */
export function redactVat(countryCode: string, vatNumber: string): string {
  const tail = vatNumber.slice(-3);
  return `${countryCode}***${tail}`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
