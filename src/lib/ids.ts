import { randomBytes, randomUUID, createHash } from "node:crypto";

/** Unguessable, URL-safe capability token: the only credential in the product. */
export function publicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newId(): string {
  return randomUUID();
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * IPs are hashed with a per-deployment salt before storage: enough to rate
 * limit and investigate abuse, useless as personal data.
 */
export function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return sha256Hex(`${salt}:${ip}`).slice(0, 32);
}
