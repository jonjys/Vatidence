import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ_EN, FAQ_SV, faqJsonLd } from "@/lib/faq";

describe("FAQ copy", () => {
  it("covers the questions that stop a first paid order", () => {
    const en = FAQ_EN.map((i) => i.q).join(" ");
    expect(en).toMatch(/Who is this for/);
    expect(en).toMatch(/consultation number/i);
    expect(en).toMatch(/own EU VAT number/);
    expect(en).toMatch(/minimum order/i);
    expect(en).toMatch(/only have one number/i);
    expect(en).toMatch(/free check does not/i);
    expect(en).toMatch(/not valid/i);
    expect(en).toMatch(/member state cannot answer/i);
    expect(en).toMatch(/account/i);
    expect(en).toMatch(/operates/i);
  });

  it("has a Swedish counterpart for each English question", () => {
    expect(FAQ_SV).toHaveLength(FAQ_EN.length);
  });

  it("states the operator and tax status without inventing numbers", () => {
    const who = FAQ_EN.find((i) => i.q.includes("operates"));
    expect(who?.a).toMatch(/Nytto Labs/);
    expect(who?.a).toMatch(/Fredrik Kornelind/);
    expect(who?.a).toMatch(/F-tax/);
    expect(who?.a).toMatch(/VAT-registered/);
    expect(who?.a).not.toMatch(/\bSE\d{10,12}\b/);
  });

  it("does not claim auditor acceptance or that this is the only way", () => {
    const all = [...FAQ_EN, ...FAQ_SV].map((i) => `${i.q} ${i.a}`).join("\n");
    expect(all).not.toMatch(/auditor accepts|official proof|the only way to get a consultation number/i);
  });

  it("emits FAQPage JSON-LD that cannot break a script tag", () => {
    const json = faqJsonLd(FAQ_EN);
    const parsed = JSON.parse(json) as { "@type": string; mainEntity: unknown[] };
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity).toHaveLength(FAQ_EN.length);
    expect(json).not.toContain("</");
  });
});

describe("FAQ is wired to both landings", () => {
  it("renders English FAQ on the homepage and Swedish FAQ on /sv", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    const sv = readFileSync("src/app/sv/page.tsx", "utf8");
    expect(home).toContain("FAQ_EN");
    expect(home).toContain("Questions accountants ask");
    expect(sv).toContain("FAQ_SV");
    expect(sv).toContain("Frågor redovisare ställer");
  });
});
