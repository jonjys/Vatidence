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

const ACCENT = "#ff5b2e";
const INK = "#16130f";
const SOFT = "#3b352e";
const PAPER = "#f6f0e6";
const CREAM = "#fffaf2";

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
          padding: "72px 96px",
          background: PAPER,
          fontFamily: "Helvetica, Arial, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -120,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: ACCENT,
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", marginBottom: 44 }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: INK,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 18,
            }}
          >
            <div style={{ display: "flex", width: 22, height: 22, borderRadius: 999, background: ACCENT }} />
          </div>
          <span style={{ fontSize: 40, fontWeight: 800, color: INK, letterSpacing: -1 }}>Vatidence</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 800,
            color: INK,
            lineHeight: 1.02,
            letterSpacing: -3,
            maxWidth: 960,
          }}
        >
          Bulk EU VAT checks, with the VIES consultation number.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: SOFT, marginTop: 30, maxWidth: 880 }}>
          Free single check. Paid batches deliver a sealed PDF and CSV.
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 44 }}>
          {["27 member states", "Consultation number", "PDF + CSV", "No account"].map((label, i) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "12px 22px",
                borderRadius: 999,
                background: i === 0 ? INK : CREAM,
                border: `2px solid ${INK}`,
                color: i === 0 ? CREAM : INK,
                fontSize: 22,
                fontWeight: 700,
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
