import { SUPPORTED_COUNTRIES, parseVat, type CountryCode } from "@/lib/vat";

/**
 * The reverse-charge exposure scan: read a sales or invoice export (Stripe,
 * an accounting system, a spreadsheet), find the customer VAT numbers the
 * zero-rated sales rest on, and put a number on what is at stake if those
 * sales cannot be evidenced.
 *
 * Everything here is pure and runs in the browser. The file is never
 * uploaded: the page says so, and nothing in this module touches the network.
 * Only the deduplicated VAT numbers move on, and only when the customer
 * chooses to verify them.
 */

/**
 * Standard VAT rates, in basis points, as of October 2026. Used only to
 * estimate what a zero-rated sale would cost if the exemption were refused,
 * and labelled as an estimate wherever it is shown. Recent changes: FI 25.5%
 * (September 2024), SK 23% (January 2025), EE 24% (July 2025), RO 21%
 * (August 2025).
 */
export const STANDARD_RATE_BP: Record<CountryCode, number> = {
  AT: 2000, BE: 2100, BG: 2000, CY: 1900, CZ: 2100, DE: 1900, DK: 2500,
  EE: 2400, EL: 2400, ES: 2100, FI: 2550, FR: 2000, HR: 2500, HU: 2700,
  IE: 2300, IT: 2200, LT: 2100, LU: 1700, LV: 2100, MT: 1800, NL: 2100,
  PL: 2300, PT: 2300, RO: 2100, SE: 2500, SI: 2200, SK: 2300, XI: 2000,
};

export function formatRate(bp: number): string {
  return `${(bp / 100).toLocaleString("en-IE", { maximumFractionDigits: 2 })}%`;
}

// ---------------------------------------------------------------- CSV

/** Reads the delimiter from the first line: whichever of , ; tab is most common outside quotes. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch]! += 1;
  }
  // A tie goes to ; or tab: a file that uses either as its delimiter writes
  // decimal commas, so "DE811907980;1.200,00" has one of each.
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d]! > 0 && counts[d]! >= counts[best]!) best = d;
  return best;
}

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF.
 * Blank lines are dropped. Good enough for every export we have seen
 * (Stripe, Fortnox, Visma, Xero, Excel "CSV UTF-8").
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endRow = () => {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
    field = "";
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      endRow();
    } else field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// ---------------------------------------------------------------- amounts

/**
 * A money cell to minor units. Accepts "1,234.56", "1.234,56", "1 234,56",
 * "€120", "120.00 EUR", "(45.00)" and "-45". Returns null for anything that
 * is not a number, so a stray text cell never counts as zero by accident.
 */
export function parseAmountMinor(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,'\s-]/g, "").replace(/[\s']/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalised: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalised = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    // One separator followed by exactly three digits is a thousands mark
    // ("1,234", "12.500"); anything else is the decimal point.
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1]!.length === 3);
    normalised = thousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
  } else normalised = s;

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  const minor = Math.round(value * 100);
  return negative ? -minor : minor;
}

// ---------------------------------------------------------------- columns

export type ColumnMap = { vat: number | null; amount: number | null; currency: number | null };

export type Table = { header: string[]; rows: string[][]; hasHeader: boolean };

const VAT_HEADER = /vat|tax[\s_.-]*(id|number|no)|ust|tva|btw|iva|moms|mwst|nip|cif|organisationsnummer/i;
const AMOUNT_HEADER_EXACT = /^(amount[\s_]*paid|total|subtotal|net([\s_]*amount)?|amount|belopp|summa|betrag|montant|importe|totalt)$/i;
const AMOUNT_HEADER = /amount|total|net|belopp|summa|betrag|montant|importe|revenue/i;
const AMOUNT_HEADER_AVOID = /tax|vat|moms|due|remaining|refund|fee|discount|count|quantity|qty/i;
const CURRENCY_HEADER = /^(currency|valuta|währung|wahrung|devise|moneda|curr)$/i;

function share(rows: string[][], col: number, test: (value: string) => boolean): number {
  let filled = 0;
  let hits = 0;
  for (const row of rows.slice(0, 500)) {
    const value = (row[col] ?? "").trim();
    if (!value) continue;
    filled += 1;
    if (test(value)) hits += 1;
  }
  return filled === 0 ? 0 : hits / filled;
}

const looksLikeVat = (v: string) => parseVat(v).ok;

/**
 * Splits off the header row, if there is one. A first row whose cells look
 * like data (a VAT number in it) is data: some exports have no header.
 */
export function toTable(cells: string[][]): Table {
  const first = cells[0] ?? [];
  const hasHeader = first.length > 0 && !first.some((cell) => looksLikeVat(cell));
  const width = Math.max(0, ...cells.map((r) => r.length));
  const header = hasHeader
    ? Array.from({ length: width }, (_, i) => (first[i] ?? "").trim() || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { header, rows: hasHeader ? cells.slice(1) : cells, hasHeader };
}

/** Best guess at which columns hold the VAT number, the amount and the currency. */
export function detectColumns(table: Table): ColumnMap {
  const { header, rows } = table;
  const cols = header.map((_, i) => i);

  const vatScores = cols
    .map((i) => ({ i, score: share(rows, i, looksLikeVat) + (VAT_HEADER.test(header[i]!) ? 0.5 : 0) }))
    .filter((c) => share(rows, c.i, looksLikeVat) >= 0.3)
    .sort((a, b) => b.score - a.score);
  const vat = vatScores[0]?.i ?? null;

  const numeric = (v: string) => parseAmountMinor(v) !== null;
  const amountScores = cols
    .filter((i) => i !== vat && share(rows, i, numeric) >= 0.8)
    .map((i) => {
      const name = header[i]!;
      let score = 0;
      if (AMOUNT_HEADER_EXACT.test(name.trim())) score += 3;
      else if (AMOUNT_HEADER.test(name)) score += 2;
      if (AMOUNT_HEADER_AVOID.test(name)) score -= 2.5;
      // Ids and dates are numeric too; real amounts usually carry decimals.
      if (share(rows, i, (v) => /[.,]\d{2}$/.test(v.trim())) >= 0.5) score += 0.5;
      return { i, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const amount = amountScores[0]?.i ?? null;

  const currencyByName = cols.find((i) => CURRENCY_HEADER.test(header[i]!.trim()));
  const currency =
    currencyByName ?? cols.find((i) => i !== vat && share(rows, i, (v) => /^[A-Za-z]{3}$/.test(v.trim())) >= 0.9) ?? null;

  return { vat, amount, currency };
}

// ---------------------------------------------------------------- the report

/** Amounts per currency, in minor units. "" is a file without a currency column. */
export type Money = Record<string, number>;

export type NumberLine = { canonical: string; countryCode: CountryCode; rows: number; amount: Money };
export type InvalidLine = { input: string; reason: string; rows: number; amount: Money };

export type ExposureReport = {
  dataRows: number;
  /** Rows with no VAT number at all: B2C sales, or B2B sales missing the one thing that justifies 0%. */
  rowsWithoutVat: number;
  /** Unique, well-formed VAT numbers, largest amount first. */
  numbers: NumberLine[];
  /** VAT values that cannot be a VAT number in any member state, largest amount first. */
  invalid: InvalidLine[];
  /** Everything sold on rows that carry a VAT value. */
  totalWithVat: Money;
  /** The part of that sold against a malformed number. */
  totalInvalid: Money;
};

function add(money: Money, currency: string, minor: number) {
  money[currency] = (money[currency] ?? 0) + minor;
}

function largest(money: Money): number {
  return Math.max(0, ...Object.values(money).map(Math.abs));
}

export function analyseExposure(table: Table, columns: ColumnMap): ExposureReport {
  const byNumber = new Map<string, NumberLine>();
  const byInvalid = new Map<string, InvalidLine>();
  const totalWithVat: Money = {};
  const totalInvalid: Money = {};
  let rowsWithoutVat = 0;

  for (const row of table.rows) {
    const raw = columns.vat === null ? "" : (row[columns.vat] ?? "").trim();
    const minor = columns.amount === null ? 0 : (parseAmountMinor(row[columns.amount] ?? "") ?? 0);
    const currency = columns.currency === null ? "" : (row[columns.currency] ?? "").trim().toUpperCase();

    if (!raw) {
      rowsWithoutVat += 1;
      continue;
    }
    add(totalWithVat, currency, minor);

    const parsed = parseVat(raw);
    if (parsed.ok) {
      const key = parsed.value.canonical;
      const line = byNumber.get(key) ?? { canonical: key, countryCode: parsed.value.countryCode, rows: 0, amount: {} };
      line.rows += 1;
      add(line.amount, currency, minor);
      byNumber.set(key, line);
    } else {
      const key = raw.slice(0, 40);
      const line = byInvalid.get(key) ?? { input: key, reason: parsed.reason, rows: 0, amount: {} };
      line.rows += 1;
      add(line.amount, currency, minor);
      byInvalid.set(key, line);
      add(totalInvalid, currency, minor);
    }
  }

  const byAmount = <T extends { amount: Money }>(a: T, b: T) => largest(b.amount) - largest(a.amount);
  return {
    dataRows: table.rows.length,
    rowsWithoutVat,
    numbers: [...byNumber.values()].sort(byAmount),
    invalid: [...byInvalid.values()].sort(byAmount),
    totalWithVat,
    totalInvalid,
  };
}

/** What a zero-rated amount would cost at a given VAT rate, rounded to the cent. */
export function vatAt(money: Money, rateBp: number): Money {
  const out: Money = {};
  for (const [currency, minor] of Object.entries(money)) out[currency] = Math.round((minor * rateBp) / 10_000);
  return out;
}

export function formatMoney(money: Money): string {
  const entries = Object.entries(money).filter(([, minor]) => minor !== 0);
  if (entries.length === 0) return formatOne(0, Object.keys(money)[0] ?? "");
  return entries
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([currency, minor]) => formatOne(minor, currency))
    .join(" + ");
}

function formatOne(minor: number, currency: string): string {
  if (/^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
    } catch {
      // an unknown code in the file; fall through to a plain number
    }
  }
  const n = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 }).format(minor / 100);
  return currency ? `${n} ${currency}` : n;
}

/** The member state a browser locale points at, for the default rate. */
export function countryFromLocale(locale: string | undefined): CountryCode {
  const region = (locale ?? "").split(/[-_]/)[1]?.toUpperCase();
  const code = region === "GR" ? "EL" : region;
  return code && (SUPPORTED_COUNTRIES as readonly string[]).includes(code) && code !== "XI" ? (code as CountryCode) : "DE";
}

// ---------------------------------------------------------------- hand-off

/** sessionStorage key the order form reads when it is opened with ?from=exposure. */
export const HANDOFF_KEY = "vatidence:handoff-list";
export const HANDOFF_PARAM = "exposure";

/** The order form's half of the hand-off: well-formed numbers only, or nothing. */
export function readHandoff(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && parseVat(v).ok);
  } catch {
    return [];
  }
}
