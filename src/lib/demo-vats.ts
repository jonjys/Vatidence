import { parseVat } from "@/lib/vat";

/**
 * Format-valid public sample VAT numbers for the order form's "Load example
 * list" action. The first three are already used as placeholders on the page;
 * the rest are the same shape as the parser tests. They are examples, not a
 * customer list — the UI labels them as such.
 *
 * Every entry must pass parseVat. Do not put a number here that we would
 * refuse to bill for.
 */
export const EXAMPLE_VAT_NUMBERS = [
  "DE811907980",
  "FR40303265045",
  "IT00743110157",
  "NL123456789B01",
  "BE0123456789",
  "ATU12345678",
  "ESB12345678",
  "IE1234567T",
  "DK12345678",
  "FI12345678",
  "PL1234567890",
  "PT123456789",
  "LU12345678",
  "HU12345678",
  "CZ12345678",
] as const;

export function exampleVatListText(): string {
  return EXAMPLE_VAT_NUMBERS.join("\n");
}

/** Throws if a sample is not a billable EU VAT number — used by tests. */
export function assertExampleVatNumbers(): void {
  for (const value of EXAMPLE_VAT_NUMBERS) {
    const parsed = parseVat(value);
    if (!parsed.ok) {
      throw new Error(`EXAMPLE_VAT_NUMBERS contains an unusable value: ${value} (${parsed.reason})`);
    }
  }
}
