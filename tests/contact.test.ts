import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT, OPERATOR_LINE } from "@/lib/contact";

/**
 * Production published the owner's personal Gmail address on the privacy,
 * terms and refunds pages, because those pages read the contact address from
 * an environment variable that had been set to it. The addresses now live in
 * one module; this makes sure no private one creeps back into anything a
 * customer can see.
 */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc;
}

const SOURCES = sourceFiles("src");

describe("published contact details", () => {
  it("routes every kind of question to its own inbox", () => {
    const inboxes = Object.values(CONTACT.email);
    expect(new Set(inboxes).size).toBe(inboxes.length);
    for (const address of inboxes) expect(address).toMatch(/^[a-z]+@nyttolabs\.com$/);
  });

  it("names the operator and the product domain", () => {
    expect(OPERATOR_LINE).toBe("Nytto Labs, Sweden");
    expect(CONTACT.productUrl).toBe("https://viesproof.eu");
    expect(CONTACT.operatorUrl).toBe("https://nyttolabs.com");
  });

  it("carries no personal or placeholder address anywhere in src/", () => {
    // An email address, not any mention of the domain: "https://example.com/"
    // in a comment about URL normalisation is illustration, not an identity.
    const forbidden = /(@(gmail|hotmail|example|yourdomain)\.com|fkornelind)/i;
    const offenders = SOURCES.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("sends every address it does publish to the company domain", () => {
    const found = new Set<string>();
    for (const file of SOURCES) {
      for (const m of readFileSync(file, "utf8").matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
        found.add(m[0]);
      }
    }
    for (const address of found) expect(address).toMatch(/@nyttolabs\.com$/);
  });
});
