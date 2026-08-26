/**
 * EU VAT identification number parsing and syntactic validation.
 *
 * Purpose: reject malformed rows BEFORE the customer pays, so we never charge
 * for a row VIES cannot answer. Everything that passes here is a row we are
 * confident we can bill for and query.
 */

export const SUPPORTED_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "XI",
] as const;

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];

const PATTERNS: Record<CountryCode, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W][A-IW]?|\d[A-Z*+]\d{5}[A-W])$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^[0-9A-Z+*]{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  XI: /^(\d{9}|\d{12}|(GD|HA)\d{3})$/,
};

/** Country codes people type that VIES spells differently. */
const ALIASES: Record<string, CountryCode> = { GR: "EL", UK: "XI", GB: "XI" };

export type ParsedVat = { countryCode: CountryCode; vatNumber: string; canonical: string };

export type VatParseError = { input: string; reason: string };

export function isSupportedCountry(code: string): code is CountryCode {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(code);
}

/** Strip everything a human might paste around the actual identifier. */
function scrub(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^VAT[\s:./-]*/i, "")
    .replace(/[\s.\-/\\,;'"()[\]]/g, "");
}

export function parseVat(raw: string): { ok: true; value: ParsedVat } | { ok: false; reason: string } {
  const cleaned = scrub(raw);
  if (cleaned.length === 0) return { ok: false, reason: "empty value" };
  if (cleaned.length > 20) return { ok: false, reason: "too long to be a VAT number" };

  const prefix = cleaned.slice(0, 2);
  const alias = ALIASES[prefix];
  const countryCode = alias ?? (isSupportedCountry(prefix) ? prefix : null);

  if (!countryCode) {
    if (/^[A-Z]{2}/.test(cleaned)) {
      return { ok: false, reason: `country "${prefix}" is not covered by VIES` };
    }
    return { ok: false, reason: "missing 2-letter country prefix (e.g. DE123456789)" };
  }

  // GB numbers are no longer in VIES; only Northern Ireland (XI) is.
  if (prefix === "GB") {
    return { ok: false, reason: "Great Britain VAT numbers left VIES after Brexit; only XI (Northern Ireland) is covered" };
  }

  const vatNumber = cleaned.slice(2);
  if (vatNumber.length === 0) return { ok: false, reason: "country prefix without a number" };
  if (!PATTERNS[countryCode].test(vatNumber)) {
    return { ok: false, reason: `does not match the ${countryCode} VAT number format` };
  }

  return { ok: true, value: { countryCode, vatNumber, canonical: `${countryCode}${vatNumber}` } };
}

export type ParseListResult = {
  /** Deduplicated, canonically ordered rows the customer will be charged for. */
  items: ParsedVat[];
  /** Rows we refuse to bill for, with a human-readable reason. */
  rejected: VatParseError[];
  /** Inputs dropped because an identical canonical number appeared earlier. */
  duplicates: string[];
};

/**
 * Accepts pasted text or CSV content. Splits on newlines, commas, semicolons
 * and tabs, so "a CSV column" and "a pasted list" are the same thing to us.
 */
export function parseVatList(input: string, limit: number): ParseListResult {
  const items: ParsedVat[] = [];
  const rejected: VatParseError[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  const tokens = input
    .split(/[\r\n,;\t|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (const token of tokens) {
    if (items.length >= limit) {
      rejected.push({ input: token, reason: `exceeds the ${limit} row limit for a single order` });
      continue;
    }
    const parsed = parseVat(token);
    if (!parsed.ok) {
      rejected.push({ input: token.slice(0, 40), reason: parsed.reason });
      continue;
    }
    if (seen.has(parsed.value.canonical)) {
      duplicates.push(parsed.value.canonical);
      continue;
    }
    seen.add(parsed.value.canonical);
    items.push(parsed.value);
  }

  return { items, rejected, duplicates };
}
