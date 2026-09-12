import { ImageResponse } from "next/og";

/**
 * The share card for links to the site. Generated at request time from the
 * same facts as the page itself, rather than a static file someone forgets to
 * update - the accent colour and copy below are the ones in globals.css and
 * layout.tsx metadata. Next serves this at /opengraph-image and wires it into
 * both openGraph.images and twitter's summary_large_image automatically.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#12467f";
const INK = "#14161c";
const MUTED = "#5b6172";
const BG = "#f7f8fa";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: BG,
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 40 }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: INK }}>VIES</span>
          <span style={{ fontSize: 40, fontWeight: 700, color: ACCENT }}>Proof</span>
        </div>
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: INK, lineHeight: 1.15, maxWidth: 920 }}>
          Bulk EU VAT checks, with the VIES consultation number.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: MUTED, marginTop: 32, maxWidth: 880 }}>
          Free single check. Paid batches deliver a sealed PDF and CSV.
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 48 }}>
          {["27 member states", "Consultation number", "PDF + CSV", "No account"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                border: `1px solid ${ACCENT}33`,
                color: ACCENT,
                fontSize: 22,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
