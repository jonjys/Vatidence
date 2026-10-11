"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_LIST } from "@/lib/countries";
import {
  HANDOFF_KEY,
  HANDOFF_PARAM,
  STANDARD_RATE_BP,
  analyseExposure,
  countryFromLocale,
  detectColumns,
  formatMoney,
  formatRate,
  parseCsv,
  toTable,
  vatAt,
  type ColumnMap,
  type Table,
} from "@/lib/exposure";
import { MAX_ROWS } from "@/lib/limits";
import { formatMinor, quote } from "@/lib/pricing";
import type { CountryCode } from "@/lib/vat";

/** Larger than the order form's limit on purpose: a year of invoices is bigger than a customer list. */
const MAX_SCAN_BYTES = 20 * 1024 * 1024;

/** A made-up export, so the page can be tried without a real file. */
const EXAMPLE_CSV = [
  "Invoice,Customer,Customer VAT,Total,Currency",
  "INV-1001,Example GmbH,DE811907980,4200.00,EUR",
  "INV-1002,Example SAS,FR40303265045,1850.00,EUR",
  "INV-1003,Example GmbH,DE811907980,3900.00,EUR",
  "INV-1004,Example BV,NL123456789B01,2600.00,EUR",
  "INV-1005,Example SpA,IT01583500986,980.00,EUR",
  "INV-1006,Example AB,SE55667788,1500.00,EUR",
  "INV-1007,Private buyer,,59.00,EUR",
  "INV-1008,Example ApS,DK12345678,720.00,EUR",
  "INV-1009,Example Kft,HU1234567,640.00,EUR",
].join("\n");

const NONE = -1;

export function ExposureScan() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [columns, setColumns] = useState<ColumnMap>({ vat: null, amount: null, currency: null });
  const [seller, setSeller] = useState<CountryCode>("DE");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeller(countryFromLocale(navigator.language));
  }, []);

  function load(text: string, name: string) {
    const next = toTable(parseCsv(text));
    if (next.rows.length === 0) {
      setError("That file has no rows to read.");
      return;
    }
    const detected = detectColumns(next);
    setTable(next);
    setColumns(detected);
    setFileName(name);
    setError(
      detected.vat === null
        ? "No column in this file looks like VAT numbers. Pick the right one below."
        : null,
    );
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function onFile(file: File) {
    if (file.size > MAX_SCAN_BYTES) {
      setError(`That file is larger than ${MAX_SCAN_BYTES / 1024 / 1024} MB. Export one year or one quarter at a time.`);
      return;
    }
    load(await file.text(), file.name);
    if (fileRef.current) fileRef.current.value = "";
  }

  const report = useMemo(
    () => (table && columns.vat !== null ? analyseExposure(table, columns) : null),
    [table, columns],
  );
  const rate = STANDARD_RATE_BP[seller];
  const sellerName = COUNTRY_LIST.find((c) => c.code === seller)?.name ?? seller;
  const verifiable = report ? report.numbers.slice(0, MAX_ROWS) : [];
  const priced = verifiable.length > 0 ? quote(verifiable.length) : null;
  const hasAmounts = columns.amount !== null;

  function verify() {
    if (verifiable.length === 0) return;
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(verifiable.map((n) => n.canonical)));
    } catch {
      setError("This browser blocks session storage, so the list cannot be carried over. Copy the numbers instead.");
      return;
    }
    window.location.href = `/?from=${HANDOFF_PARAM}#order`;
  }

  function column(key: keyof ColumnMap, label: string, hint: string) {
    if (!table) return null;
    const id = `col-${key}`;
    return (
      <div className="field exp-col">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={columns[key] ?? NONE}
          onChange={(e) => {
            const v = Number(e.target.value);
            setColumns((prev) => ({ ...prev, [key]: v === NONE ? null : v }));
            if (key === "vat" && v !== NONE) setError(null);
          }}
        >
          <option value={NONE}>{key === "vat" ? "Choose a column" : "None"}</option>
          {table.header.map((name, i) => (
            <option key={`${name}-${i}`} value={i}>
              {name}
              {table.rows[0]?.[i] ? ` (e.g. ${table.rows[0][i]!.slice(0, 24)})` : ""}
            </option>
          ))}
        </select>
        <p className="hint">{hint}</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <p className="card-title">1. Drop your sales export</p>
        <p className="card-sub">
          Any CSV with one row per invoice or sale: a Stripe invoice or payments export, your accounting system, or a
          spreadsheet saved as CSV.
        </p>
        <label
          className="exp-drop"
          data-drag={dragging ? "true" : undefined}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            const file = e.dataTransfer.files?.[0];
            setDragging(false);
            if (!file) return;
            e.preventDefault();
            void onFile(file);
          }}
        >
          <span className="exp-drop-title">
            <span aria-hidden="true">↑</span> {fileName ? `Loaded ${fileName}. Drop another file` : "Choose or drop a CSV file"}
          </span>
          <span className="hint">Read in this browser. The file is never uploaded.</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>
        <div className="list-actions">
          <button type="button" className="ghost" onClick={() => load(EXAMPLE_CSV, "example.csv")}>
            Try it with an example file
          </button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div ref={resultRef}>
        {table ? (
          <div className="panel">
            <p className="card-title">2. Check the columns</p>
            <p className="card-sub">
              Read {table.rows.length.toLocaleString("en-IE")} row{table.rows.length === 1 ? "" : "s"}. The columns were
              guessed from their names and contents; change any that are wrong.
            </p>
            <div className="exp-cols">
              {column("vat", "Customer VAT number", "The buyer's VAT number on each sale.")}
              {column("amount", "Amount", "Net or total per sale. On a 0% invoice they are the same.")}
              {column("currency", "Currency", "Optional. Totals are kept per currency.")}
            </div>
            <div className="field exp-col">
              <label htmlFor="seller">Your business is VAT-registered in</label>
              <select id="seller" value={seller} onChange={(e) => setSeller(e.target.value as CountryCode)}>
                {COUNTRY_LIST.filter((c) => c.code !== "XI").map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({formatRate(STANDARD_RATE_BP[c.code])})
                  </option>
                ))}
              </select>
              <p className="hint">
                If a 0% sale is not accepted, it is usually taxed as a domestic sale at your own standard rate.
              </p>
            </div>
          </div>
        ) : null}

        {report ? (
          <div className="panel exp-result" aria-live="polite">
            <p className="kicker">Your exposure</p>
            {hasAmounts ? (
              <>
                <p className="exp-big">{formatMoney(vatAt(report.totalWithVat, rate))}</p>
                <p className="exp-big-sub">
                  of VAT rides on {report.numbers.length + report.invalid.length} customer VAT number
                  {report.numbers.length + report.invalid.length === 1 ? "" : "s"}: what {sellerName}&apos;s{" "}
                  {formatRate(rate)} would add to {formatMoney(report.totalWithVat)} of sales invoiced to them, if the
                  numbers behind them cannot be shown to have been valid.
                </p>
              </>
            ) : (
              <p className="exp-big-sub">
                {report.numbers.length + report.invalid.length} customer VAT numbers found. Pick an amount column above to
                see what is at stake.
              </p>
            )}

            <div className="summary">
              <div className={report.numbers.length > 0 ? "stat ok-tile" : "stat"}>
                <div className="n">{report.numbers.length}</div>
                <div className="k">numbers to evidence</div>
              </div>
              <div className={report.invalid.length > 0 ? "stat bad-tile" : "stat"}>
                <div className="n">{report.invalid.length}</div>
                <div className="k">malformed</div>
              </div>
              <div className="stat">
                <div className="n">{report.rowsWithoutVat}</div>
                <div className="k">rows without VAT no.</div>
              </div>
            </div>

            {report.invalid.length > 0 ? (
              <div className="error exp-invalid">
                <b>
                  {report.invalid.length} number{report.invalid.length === 1 ? " is" : "s are"} not a VAT number in any
                  member state
                  {hasAmounts
                    ? `: ${formatMoney(report.totalInvalid)} of sales, about ${formatMoney(vatAt(report.totalInvalid, rate))} of VAT, with nothing to show for the 0%.`
                    : "."}
                </b>{" "}
                Ask these customers for their correct number before the next invoice.
                <div className="rejects">
                  {report.invalid.slice(0, 50).map((line) => (
                    <div key={line.input}>
                      {line.input} — {line.reason}
                      {hasAmounts ? ` · ${formatMoney(line.amount)}` : ""}
                    </div>
                  ))}
                  {report.invalid.length > 50 ? <div>…and {report.invalid.length - 50} more</div> : null}
                </div>
              </div>
            ) : null}

            {report.rowsWithoutVat > 0 ? (
              <p className="hint">
                {report.rowsWithoutVat} row{report.rowsWithoutVat === 1 ? " has" : "s have"} no VAT number. That is
                expected for sales to consumers; a business sale invoiced at 0% without one is the weakest kind there is.
              </p>
            ) : null}

            {report.numbers.length > 0 ? (
              <div className="exp-table-wrap">
                <table className="exp-table">
                  <caption className="hint">
                    {hasAmounts ? "Largest customers first" : "Customer VAT numbers"}
                    {report.numbers.length > 10 ? `, top 10 of ${report.numbers.length}` : ""}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">VAT number</th>
                      <th scope="col">Rows</th>
                      {hasAmounts ? <th scope="col">Sold</th> : null}
                      {hasAmounts ? <th scope="col">VAT at stake</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {report.numbers.slice(0, 10).map((line) => (
                      <tr key={line.canonical}>
                        <td>
                          <code>{line.canonical}</code>
                        </td>
                        <td>{line.rows}</td>
                        {hasAmounts ? <td>{formatMoney(line.amount)}</td> : null}
                        {hasAmounts ? <td>{formatMoney(vatAt(line.amount, rate))}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {priced ? (
              <div className="exp-cta">
                <div>
                  <p className="exp-cta-title">
                    Get an official VIES consultation number for all {verifiable.length} customer
                    {verifiable.length === 1 ? "" : "s"}
                  </p>
                  <p className="hint">
                    Each number is checked with the European Commission&apos;s VIES service with your own VAT number
                    attached, and comes back in a sealed PDF and CSV evidence pack. One payment of{" "}
                    <b>{formatMinor(priced.totalMinor)}</b>, no account. Numbers VIES cannot answer are refunded.
                    {report.numbers.length > MAX_ROWS ? ` The first ${MAX_ROWS} are carried over; run the rest as a second order.` : ""}
                  </p>
                </div>
                <button type="button" className="pay-cta" onClick={verify}>
                  Continue with {verifiable.length} number{verifiable.length === 1 ? "" : "s"}{" "}
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              </div>
            ) : null}

            <p className="hint exp-fine">
              An estimate, not tax advice. It assumes every sale in the file was invoiced at 0% under the reverse
              charge or as an intra-EU supply. A consultation number proves a VAT number was valid on the day it was
              issued, so check your customer list every quarter: that way each period has its own proof.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
