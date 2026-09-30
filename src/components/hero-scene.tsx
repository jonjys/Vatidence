/**
 * The hero illustration: a pasted list going in, a sealed evidence pack coming
 * out. Drawn in HTML/CSS (no images, no layout shift) from the same pieces as
 * the real product - the list box, the price, the PDF's own columns. The
 * consultation numbers are illustrative and deliberately differ in shape,
 * because member states issue them in different formats.
 */
const ROWS = [
  { vat: "DE130745279", ok: true, id: "WAPIAAAAaBDiifgO" },
  { vat: "FR40303265045", ok: true, id: "8ed996c1-28db-4c1e" },
  { vat: "IE8280018G", ok: true, id: "WAPIAAAAaBDk2mQx" },
  { vat: "NL123456789B01", ok: false, id: "n/a (not valid)" },
  { vat: "SE556566943801", ok: true, id: "c41b07e2-9f3a-47d0" },
] as const;

export function HeroScene() {
  return (
    <figure className="scene" aria-label="A list of VAT numbers goes in; a sealed PDF with a consultation number per row comes out.">
      <div className="scene-in" aria-hidden="true">
        <svg className="path" viewBox="0 0 100 95" preserveAspectRatio="none" focusable="false">
          <path
            className="dash"
            d="M20 51 C 17 56, 17 60, 20 63 M72 56 C 74 60, 72 64, 68 66"
            fill="none"
            stroke="#16130f"
            strokeOpacity="0.4"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="s-list rise" style={{ "--d": "80ms" } as React.CSSProperties}>
          <div className="float" style={{ "--d": "0s" } as React.CSSProperties}>
            <div className="layer">
              <p className="s-title">Your list</p>
              <div className="s-lines">
                <span>DE130745279</span>
                <span>FR40303265045</span>
                <span>IE8280018G</span>
                <span>NL123456789B01</span>
                <span className="more">+ 96 more…</span>
              </div>
              <div className="s-price">
                <small>100 numbers</small>
                <strong>€24.00</strong>
              </div>
              <span className="s-pill">Pay and verify</span>
            </div>
            <span className="s-b1">
              <span className="badge step-pulse" style={{ "--d": "0s" } as React.CSSProperties}>
                <b>1</b>Paste a list
              </span>
            </span>
            <span className="s-b2">
              <span className="badge step-pulse" style={{ "--d": "3s" } as React.CSSProperties}>
                <b>2</b>Pay once
              </span>
            </span>
          </div>
        </div>

        <div className="s-pack rise" style={{ "--d": "200ms" } as React.CSSProperties}>
          <div className="float" style={{ "--d": "1.6s" } as React.CSSProperties}>
            <div className="layer" style={{ position: "relative" }}>
              <div className="s-doc-head">
                <p>
                  EU VAT verification evidence (VIES)
                  <small>100 rows · 96 valid · 4 not valid</small>
                </p>
                <span className="s-pdf">PDF</span>
              </div>
              <div className="s-rows">
                {ROWS.map((r) => (
                  <div className="s-row" key={r.vat}>
                    <span>{r.vat}</span>
                    <span className={r.ok ? "v" : "v no"}>{r.ok ? "VALID" : "NOT VALID"}</span>
                    <span className="c">{r.id}</span>
                  </div>
                ))}
              </div>
              <span className="s-seal seal-spin">
                SHA-256
                <br />
                SEALED
              </span>
            </div>
          </div>
        </div>

        <div className="s-done done-pop">
          <span className="layer">
            <b>✓</b>
            <span>100 of 100 resolved</span>
          </span>
        </div>

        <div className="s-id rise" style={{ "--d": "320ms" } as React.CSSProperties}>
          <div className="float" style={{ "--d": "3.2s" } as React.CSSProperties}>
            <div className="s-bubble">Consultation number issued for every row</div>
            <div className="layer s-chip">
              <span>vatidence.nyttolabs.com/r/…</span>
              <em>PDF + CSV</em>
            </div>
            <span className="s-b3">
              <span className="badge step-pulse" style={{ "--d": "6s" } as React.CSSProperties}>
                <b>3</b>Download the pack
              </span>
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
