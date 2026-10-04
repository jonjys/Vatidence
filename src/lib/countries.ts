import { SUPPORTED_COUNTRIES, type CountryCode } from "@/lib/vat";

/**
 * What a person needs to know about each VIES member state's numbers, in the
 * words they would use: the name, the shape of the number after the prefix,
 * and a made-up example that passes `parseVat`. The examples are deliberately
 * fake (sequential digits) - a real company's number on a reference page
 * would read as an endorsement, and a sole trader's can contain a personal
 * identity number.
 *
 * `tests/countries.test.ts` pins that every example parses, so this table
 * cannot drift from the patterns in `vat.ts`.
 */
export type CountryInfo = {
  code: CountryCode;
  name: string;
  /** The part after the country prefix, described for a human. */
  format: string;
  example: string;
  /** Anything that trips people up with this member state, if there is one. */
  note?: string;
};

export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  AT: { code: "AT", name: "Austria", format: "U followed by 8 digits", example: "ATU12345678", note: "The U is part of the number." },
  BE: { code: "BE", name: "Belgium", format: "10 digits, starting with 0 or 1", example: "BE0123456789", note: "Older 9-digit numbers take a leading 0." },
  BG: { code: "BG", name: "Bulgaria", format: "9 or 10 digits", example: "BG123456789" },
  CY: { code: "CY", name: "Cyprus", format: "8 digits and a letter", example: "CY12345678L" },
  CZ: { code: "CZ", name: "Czechia", format: "8, 9 or 10 digits", example: "CZ12345678" },
  DE: {
    code: "DE",
    name: "Germany",
    format: "9 digits",
    example: "DE123456789",
    note: "VIES confirms validity only: no name or address is ever returned.",
  },
  DK: { code: "DK", name: "Denmark", format: "8 digits", example: "DK12345678" },
  EE: { code: "EE", name: "Estonia", format: "9 digits", example: "EE123456789" },
  EL: { code: "EL", name: "Greece", format: "9 digits", example: "EL123456789", note: "VIES uses EL, not GR. GR is converted automatically." },
  ES: {
    code: "ES",
    name: "Spain",
    format: "9 characters: a letter or digit, 7 digits, a letter or digit",
    example: "ESX1234567X",
  },
  FI: { code: "FI", name: "Finland", format: "8 digits", example: "FI12345678" },
  FR: { code: "FR", name: "France", format: "2 characters (the key) and the 9-digit SIREN", example: "FR12345678901" },
  HR: { code: "HR", name: "Croatia", format: "11 digits", example: "HR12345678901" },
  HU: { code: "HU", name: "Hungary", format: "8 digits", example: "HU12345678" },
  IE: {
    code: "IE",
    name: "Ireland",
    format: "7 digits and 1 or 2 letters",
    example: "IE1234567T",
    note: "Older numbers put a letter second, e.g. IE1A23456B.",
  },
  IT: { code: "IT", name: "Italy", format: "11 digits", example: "IT12345678901" },
  LT: { code: "LT", name: "Lithuania", format: "9 or 12 digits", example: "LT123456789" },
  LU: { code: "LU", name: "Luxembourg", format: "8 digits", example: "LU12345678" },
  LV: { code: "LV", name: "Latvia", format: "11 digits", example: "LV12345678901" },
  MT: { code: "MT", name: "Malta", format: "8 digits", example: "MT12345678" },
  NL: { code: "NL", name: "Netherlands", format: "9 characters, B, 2 digits", example: "NL123456789B01", note: "The B and the two digits are part of the number." },
  PL: { code: "PL", name: "Poland", format: "10 digits", example: "PL1234567890" },
  PT: { code: "PT", name: "Portugal", format: "9 digits", example: "PT123456789" },
  RO: { code: "RO", name: "Romania", format: "2 to 10 digits", example: "RO1234567890" },
  SE: {
    code: "SE",
    name: "Sweden",
    format: "12 digits: the 10-digit organisation number and 01",
    example: "SE123456789001",
  },
  SI: { code: "SI", name: "Slovenia", format: "8 digits", example: "SI12345678" },
  SK: { code: "SK", name: "Slovakia", format: "10 digits", example: "SK1234567890" },
  XI: {
    code: "XI",
    name: "Northern Ireland",
    format: "9 or 12 digits",
    example: "XI123456789",
    note: "Only Northern Ireland is in VIES since Brexit. GB numbers are not.",
  },
};

export const COUNTRY_LIST: CountryInfo[] = SUPPORTED_COUNTRIES.map((code) => COUNTRIES[code]);

/**
 * Country codes people type that VIES spells differently. GB is left out on
 * purpose: `parseVat` rejects it with the Brexit explanation, and showing
 * "Northern Ireland" while someone types a GB number would say the opposite.
 */
const TYPED_ALIASES: Record<string, CountryCode> = { GR: "EL", UK: "XI" };

/**
 * The member state a partly typed number is heading for, read from its first
 * two letters - before it is complete or valid. Used to say "Germany: 9
 * digits" while someone is still typing, instead of an error.
 */
export function countryFromInput(raw: string): CountryInfo | null {
  const head = raw
    .toUpperCase()
    .replace(/^VAT[\s:./-]*/, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);
  if (head.length < 2) return null;
  const code = TYPED_ALIASES[head] ?? head;
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(code) ? COUNTRIES[code as CountryCode] : null;
}
