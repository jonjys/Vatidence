import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT, OPERATOR_IDENTITY, OPERATOR_LINE, OPERATOR_TAX_STATUS } from "@/lib/contact";

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
const LEGAL_PAGES = [
  "src/app/terms/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/refunds/page.tsx",
];

describe("published contact details", () => {
  it("routes every kind of question to its own inbox", () => {
    const inboxes = Object.values(CONTACT.email);
    expect(new Set(inboxes).size).toBe(inboxes.length);
    for (const address of inboxes) expect(address).toMatch(/^[a-z]+@nyttolabs\.com$/);
  });

  it("names the operator, the person who operates it, and the product domain", () => {
    expect(OPERATOR_LINE).toBe("Nytto Labs, Sweden");
    expect(OPERATOR_IDENTITY).toBe("Nytto Labs, operated by Fredrik Kornelind, Sweden");
    expect(CONTACT.operatedBy).toBe("Fredrik Kornelind");
    expect(CONTACT.legalForm).toBe("Swedish sole trader");
    expect(CONTACT.productUrl).toBe("https://vatidence.nyttolabs.com");
    expect(CONTACT.operatorUrl).toBe("https://nyttolabs.com");
  });

  it("states F-tax approval and VAT registration without inventing numbers", () => {
    expect(OPERATOR_TAX_STATUS).toBe("Approved for F-tax. VAT-registered.");
    expect(CONTACT).not.toHaveProperty("vatNumber");
    expect(CONTACT).not.toHaveProperty("organisationNumber");
    expect(CONTACT).not.toHaveProperty("orgNumber");
    expect(CONTACT).not.toHaveProperty("address");
    expect(CONTACT).not.toHaveProperty("personnummer");
  });

  it("carries no personal or placeholder address anywhere in src/", () => {
    // An email address, not any mention of the domain: "https://example.com/"
    // in a comment about URL normalisation is illustration, not an identity.
    // "Fredrik Kornelind" is the published name and does not contain this token;
    // the token is the private mailbox local-part that must never appear.
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

describe("published claims", () => {
  it("does not assert auditor acceptance, official proof, or that this is the only way to get a consultation number", () => {
    const forbidden =
      /auditor accepts|official proof|the only way to get a consultation number|evidence of verification under EU VAT rules/i;
    const offenders = SOURCES.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("does not claim registration is still in progress, or that the operator is not VAT-registered", () => {
    const forbidden = /registration in progress|not VAT registered|not yet VAT|not VAT-registered/i;
    const offenders = SOURCES.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("puts operator name and F-tax status next to Pay, without inventing numbers", () => {
    const form = readFileSync("src/components/order-form.tsx", "utf8");
    expect(form).toContain("CONTACT.operator");
    expect(form).toContain("OPERATOR_TAX_STATUS");
    expect(form).toContain("/refunds");
  });

  it("puts the operator person and F-tax status on the terms and contact pages", () => {
    const terms = readFileSync("src/app/terms/page.tsx", "utf8");
    const contact = readFileSync("src/app/contact/page.tsx", "utf8");
    expect(terms).toContain("CONTACT.operatedBy");
    expect(terms).toContain("OPERATOR_TAX_STATUS");
    expect(terms).toContain("CONTACT.legalForm");
    expect(contact).toContain("CONTACT.operatedBy");
    expect(contact).toContain("OPERATOR_TAX_STATUS");
  });

  it("identifies the privacy controller as the trading name operated by the named person", () => {
    const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
    expect(privacy).toContain("OPERATOR_IDENTITY");
  });

  it("does not invent an organisation number, VAT number or personnummer on legal pages", () => {
    // Shapes only: comments may name the things we refuse to publish.
    const invented = /\bSE\d{10,12}\b|\b\d{8}-\d{4}\b|\b\d{6}-\d{4}\b/;
    const offenders = ["src/lib/contact.ts", ...LEGAL_PAGES].filter((f) => invented.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("names the operator person on the evidence pack footer", () => {
    const evidence = readFileSync("src/lib/evidence.ts", "utf8");
    expect(evidence).toContain("OPERATOR_IDENTITY");
  });
});
