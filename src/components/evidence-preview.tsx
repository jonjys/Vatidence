import { CONTACT, OPERATOR_IDENTITY } from "@/lib/contact";

/**
 * A miniature of page one of the real evidence PDF: the same title, header
 * lines, six columns and footer that src/lib/evidence.ts draws, at the same
 * A4-landscape proportions. Names are what VIES returned for these public
 * sample numbers; the consultation numbers and the seal are illustrative.
 */
const ROWS = [
  { vat: "DE130745279", status: "VALID", id: "WAPIAAAAaBDiifgO", name: "-" },
  { vat: "FR40303265045", status: "VALID", id: "8ed996c1-28db-4c1e-9d0a-51f2", name: "SA SODIMAS" },
  { vat: "SE556566943801", status: "VALID", id: "WAPIAAAAaBDk2mQx", name: "MOSSLUNDA SNICKERI AB" },
  { vat: "NL004495445B01", status: "VALID", id: "WAPIAAAAaBDk3Rtw", name: "OPENJONGERENVERENIGING DE KOORNBEURS" },
  { vat: "BE0123456789", status: "NOT VALID", id: "n/a (not valid)", name: "-" },
  { vat: "IE8280018G", status: "VALID", id: "c41b07e2-9f3a-47d0-8e61-0b3c", name: "COMBILIFT UNLIMITED COMPANY" },
] as const;

const SEAL = "3f9a0c7e51d24b88a6e03c91f7d25b4e0a8c6d13e97f24b5c0d8a1e6f3b92c47";

export function EvidencePreview() {
  return (
    <figure className="pdf" style={{ margin: 0 }}>
      <div className="pdf-stack" aria-hidden="true">
        <span className="pdf-callout">
          <b>✓</b> SHA-256 seal on every page
        </span>
        <div className="pdf-sheet">
          <p className="pdf-title">EU VAT verification evidence (VIES)</p>
          <div className="pdf-meta">
            <p>Requester VAT: SE556036079301</p>
            <p>Order reference: k7Qm2vXa9RtLw4Pz</p>
            <p>Rows: 6 &nbsp; valid: 5 &nbsp; not valid: 1 &nbsp; unverifiable: 0</p>
            <p>Generated: 2026-09-30T09:14:07.412Z</p>
            <p>Integrity seal (SHA-256 of the result set): {SEAL}</p>
          </div>
          <div className="pdf-table">
            <div className="pdf-tr th">
              <span>#</span>
              <span>VAT number</span>
              <span>Status</span>
              <span>VIES consultation number</span>
              <span>Checked (UTC)</span>
              <span>Registered name / note</span>
            </div>
            {ROWS.map((r, i) => (
              <div className="pdf-tr" key={r.vat}>
                <span>{i + 1}</span>
                <span>{r.vat}</span>
                <span className={r.status === "VALID" ? "st-ok" : "st-no"}>{r.status}</span>
                <span>{r.id}</span>
                <span>2026-09-30T09:14:0{i + 1}Z</span>
                <span className={r.name === "-" ? "dim" : undefined}>{r.name}</span>
              </div>
            ))}
          </div>
          <div className="pdf-foot">
            <p>Page 1 of 1 &nbsp;- &nbsp;seal {SEAL.slice(0, 16)}</p>
            <p>
              Consultation numbers are issued by the European Commission&apos;s VIES service when the requester
              identifies itself.
            </p>
            <p>
              {CONTACT.product} - {CONTACT.productUrl} - {OPERATOR_IDENTITY} - {CONTACT.email.support}
            </p>
          </div>
        </div>
      </div>
      <figcaption className="illustration">
        Page one of an evidence pack, drawn to scale. Consultation numbers and seal are illustrative.
        <span className="sample-links">
          See the real thing, generated from sample data: <a href="/sample-evidence.pdf">sample PDF</a> ·{" "}
          <a href="/sample-evidence.csv" download>
            sample CSV
          </a>
        </span>
      </figcaption>
    </figure>
  );
}
