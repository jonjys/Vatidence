import type { Metadata } from "next";
import Link from "next/link";
import { COUNTRY_LIST } from "@/lib/countries";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "EU VAT number formats for all 27 member states and Northern Ireland",
  description:
    "The format of a VAT number in every EU member state and Northern Ireland: country prefix, length and an example, with the traps (EL for Greece, ATU, the Dutch B01).",
  alternates: { canonical: "/vat-number-formats" },
};

export default function FormatsPage() {
  return (
    <div className="page page-wide">
      <p className="kicker">Reference</p>
      <h1>EU VAT number formats</h1>
      <p className="lede">
        Every EU VAT number starts with a two-letter country prefix, followed by a national number whose shape differs by
        member state. This is the shape VIES expects for each of them. The examples are made up: use them to check a
        format, not a company.
      </p>

      <div className="fmt-callouts">
        <p>
          <b>Greece is EL</b>, not GR.
        </p>
        <p>
          <b>Northern Ireland is XI.</b> GB numbers left VIES with Brexit.
        </p>
        <p>
          <b>Spaces, dots and dashes</b> are not part of the number. The check here strips them for you.
        </p>
      </div>

      <table className="fmt-table">
        <thead>
          <tr>
            <th scope="col">Member state</th>
            <th scope="col">Format after the prefix</th>
            <th scope="col">Example</th>
          </tr>
        </thead>
        <tbody>
          {COUNTRY_LIST.map((c) => (
            <tr key={c.code} id={c.code.toLowerCase()}>
              <th scope="row">
                <span className="fmt-code">{c.code}</span>
                {c.name}
              </th>
              <td>
                {c.format}
                {c.note ? <span className="fmt-note">{c.note}</span> : null}
              </td>
              <td>
                <code>{c.example}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>A number with the right format can still be invalid</h2>
      <p>
        The format only says a number could exist. Whether it is registered, and still registered today, is something
        only the member state knows, and VIES is how you ask it. Registrations are withdrawn all the time, so a number
        that was valid last quarter is worth checking again.
      </p>
      <p>
        <Link href="/#check" className="btn">
          Check a number free <span className="arrow" aria-hidden="true">→</span>
        </Link>
      </p>

      <h2>Checking a whole list</h2>
      <p>
        Paste a customer list on the <Link href="/#order">homepage</Link> and every line is checked against these formats
        before you pay: lines that cannot be VAT numbers are skipped and never charged. The rest go to VIES with your own
        VAT number attached, which is what makes VIES issue a consultation number for each one.
      </p>
    </div>
  );
}
