import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CONTACT, OPERATOR_IDENTITY } from "@/lib/contact";
import { sha256Hex } from "@/lib/ids";
import type { Order, OrderItem } from "@/lib/types";

/**
 * The deliverable. Two files, generated on demand from the database, so there
 * is no object storage to pay for and no stale copy to keep in sync.
 *
 * The `seal` is a SHA-256 over the canonical result set only - never over the
 * generation timestamp - so regenerating the pack a year later produces the
 * identical seal, which is the point of calling it evidence.
 */

export type EvidenceRow = {
  position: number;
  vatNumber: string;
  status: "valid" | "invalid" | "unverifiable";
  consultationNumber: string | null;
  requestDate: string | null;
  traderName: string | null;
  traderAddress: string | null;
  note: string | null;
};

export type EvidenceDocument = {
  orderReference: string;
  requesterVat: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  unverifiableCount: number;
  rows: EvidenceRow[];
};

function rowStatus(item: OrderItem): EvidenceRow["status"] {
  if (item.status === "valid") return "valid";
  if (item.status === "invalid") return "invalid";
  return "unverifiable";
}

export function buildEvidence(order: Order, items: OrderItem[]): EvidenceDocument {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const rows: EvidenceRow[] = sorted.map((item) => ({
    position: item.position,
    vatNumber: `${item.countryCode}${item.vatNumber}`,
    status: rowStatus(item),
    consultationNumber: item.viesRequestId,
    requestDate: item.viesRequestDate,
    traderName: item.viesName,
    traderAddress: item.viesAddress,
    note: item.status === "failed_permanent" ? (item.lastError ?? "upstream unavailable") : null,
  }));

  return {
    orderReference: order.publicToken,
    requesterVat: `${order.requesterCountry}${order.requesterVat}`,
    rowCount: rows.length,
    validCount: rows.filter((r) => r.status === "valid").length,
    invalidCount: rows.filter((r) => r.status === "invalid").length,
    unverifiableCount: rows.filter((r) => r.status === "unverifiable").length,
    rows,
  };
}

/** Stable serialisation: fixed key order, no incidental fields. */
export function canonicalJson(doc: EvidenceDocument): string {
  return JSON.stringify({
    orderReference: doc.orderReference,
    requesterVat: doc.requesterVat,
    rowCount: doc.rowCount,
    rows: doc.rows.map((r) => ({
      position: r.position,
      vatNumber: r.vatNumber,
      status: r.status,
      consultationNumber: r.consultationNumber ?? "",
      requestDate: r.requestDate ?? "",
      traderName: r.traderName ?? "",
      traderAddress: r.traderAddress ?? "",
    })),
  });
}

export function sealOf(doc: EvidenceDocument): string {
  return sha256Hex(canonicalJson(doc));
}

function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  // Guard against spreadsheet formula injection in a file we hand to finance teams.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

export function toCsv(doc: EvidenceDocument): string {
  const header = [
    "row",
    "vat_number",
    "status",
    "vies_consultation_number",
    "vies_request_date",
    "trader_name",
    "trader_address",
    "note",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of doc.rows) {
    lines.push(
      [
        r.position,
        r.vatNumber,
        r.status,
        r.consultationNumber,
        r.requestDate,
        r.traderName,
        r.traderAddress,
        r.note,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM so Excel opens UTF-8 correctly without a manual import step.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** WinAnsi is all the standard PDF fonts can encode; anything else becomes '?'. */
const WINANSI_HOLES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

export function winAnsi(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += " ";
    } else if (code < 0x20) {
      continue;
    } else if (code > 0xff || WINANSI_HOLES.has(code)) {
      out += "?";
    } else {
      out += ch;
    }
  }
  return out;
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const safe = winAnsi(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let lo = 0;
  let hi = safe.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${safe.slice(0, mid)}...`, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${safe.slice(0, lo)}...`;
}

const PAGE_W = 841.89; // A4 landscape
const PAGE_H = 595.28;
const MARGIN = 32;
const ROW_H = 14;

const COLUMNS: Array<{ key: keyof EvidenceRow | "position"; label: string; width: number }> = [
  { key: "position", label: "#", width: 28 },
  { key: "vatNumber", label: "VAT number", width: 110 },
  { key: "status", label: "Status", width: 66 },
  { key: "consultationNumber", label: "VIES consultation number", width: 200 },
  { key: "requestDate", label: "Checked (UTC)", width: 135 },
  { key: "traderName", label: "Registered name / note", width: 239 },
];

export async function toPdf(doc: EvidenceDocument, generatedAt: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`VIES verification evidence ${doc.orderReference}`);
  pdf.setAuthor(CONTACT.operator);
  pdf.setCreator("VIESProof");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const seal = sealOf(doc);

  const rowsPerPage = Math.floor((PAGE_H - 150 - MARGIN) / ROW_H);
  const pageCount = Math.max(1, Math.ceil(doc.rows.length / rowsPerPage));

  const drawHeader = (page: PDFPage, pageIndex: number): number => {
    let y = PAGE_H - MARGIN;
    page.drawText("EU VAT verification evidence (VIES)", { x: MARGIN, y: y - 14, size: 15, font: bold });
    y -= 34;

    const meta = [
      `Requester VAT: ${doc.requesterVat}`,
      `Order reference: ${doc.orderReference}`,
      `Rows: ${doc.rowCount}   valid: ${doc.validCount}   not valid: ${doc.invalidCount}   unverifiable: ${doc.unverifiableCount}`,
      `Generated: ${generatedAt.toISOString()}`,
      `Integrity seal (SHA-256 of the result set): ${seal}`,
    ];
    for (const line of meta) {
      page.drawText(winAnsi(line), { x: MARGIN, y: y - 9, size: 8.5, font, color: rgb(0.25, 0.25, 0.3) });
      y -= 12;
    }

    y -= 10;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.7,
      color: rgb(0.7, 0.72, 0.78),
    });
    y -= 14;

    let x = MARGIN;
    for (const col of COLUMNS) {
      page.drawText(col.label, { x, y, size: 8.5, font: bold, color: rgb(0.1, 0.1, 0.15) });
      x += col.width;
    }
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.82, 0.84, 0.88),
    });

    page.drawText(winAnsi(`Page ${pageIndex + 1} of ${pageCount}  -  seal ${seal.slice(0, 16)}`), {
      x: MARGIN,
      y: MARGIN - 12,
      size: 7.5,
      font,
      color: rgb(0.45, 0.45, 0.5),
    });
    page.drawText(
      winAnsi(
        "Consultation numbers are issued by the European Commission's VIES service when the requester identifies itself.",
      ),
      { x: MARGIN, y: MARGIN - 24, size: 7, font, color: rgb(0.5, 0.5, 0.55) },
    );
    // Whoever reads this pack months from now needs to know who produced it
    // and where to write about it, without still having the order email.
    page.drawText(
      winAnsi(
        `${CONTACT.product} - ${CONTACT.productUrl} - ${OPERATOR_IDENTITY} - ${CONTACT.email.support}`,
      ),
      { x: MARGIN, y: MARGIN - 34, size: 7, font, color: rgb(0.5, 0.5, 0.55) },
    );

    return y - ROW_H;
  };

  for (let p = 0; p < pageCount; p++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = drawHeader(page, p);
    const slice = doc.rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);

    for (const row of slice) {
      const cells: Array<string> = [
        String(row.position),
        row.vatNumber,
        row.status === "valid" ? "VALID" : row.status === "invalid" ? "NOT VALID" : "UNVERIFIABLE",
        row.consultationNumber ?? (row.status === "invalid" ? "n/a (not valid)" : "-"),
        row.requestDate ?? "-",
        row.traderName ?? row.note ?? "-",
      ];
      const color =
        row.status === "valid" ? rgb(0.05, 0.35, 0.15) : row.status === "invalid" ? rgb(0.55, 0.1, 0.1) : rgb(0.5, 0.35, 0);

      let x = MARGIN;
      cells.forEach((cell, idx) => {
        const col = COLUMNS[idx];
        if (!col) return;
        page.drawText(fit(font, cell, 8, col.width - 6), {
          x,
          y,
          size: 8,
          font,
          color: idx === 2 ? color : rgb(0.12, 0.12, 0.16),
        });
        x += col.width;
      });
      y -= ROW_H;
    }
  }

  return pdf.save();
}
