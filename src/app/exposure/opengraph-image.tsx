import { ImageResponse } from "next/og";

/**
 * The share card for /exposure, the page most likely to be posted as a link.
 * Same palette as the site card in src/app/opengraph-image.tsx; the copy is
 * the page's own question, so the link reads the same in a feed as on arrival.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "How much VAT rides on your customers' VAT numbers? Free exposure scan by Vatidence.";

const ACCENT = "#ff5b2e";
const INK = "#16130f";
const SOFT = "#3b352e";
const PAPER = "#f6f0e6";
const CREAM = "#fffaf2";

export default function ExposureImage() {
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
            right: 80,
            top: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 300,
            height: 300,
            borderRadius: 999,
            background: ACCENT,
            color: INK,
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -6,
          }}
        >
          €?
        </div>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              width: 52,
              height: 52,
              borderRadius: 15,
              background: INK,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 16,
            }}
          >
            <div style={{ display: "flex", width: 20, height: 20, borderRadius: 999, background: ACCENT }} />
          </div>
          <span style={{ fontSize: 36, fontWeight: 800, color: INK, letterSpacing: -1 }}>Vatidence</span>
          <span style={{ fontSize: 24, color: SOFT, marginLeft: 18 }}>Free exposure scan</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 66,
            fontWeight: 800,
            color: INK,
            lineHeight: 1.03,
            letterSpacing: -3,
            maxWidth: 700,
          }}
        >
          How much VAT rides on your customers&apos; VAT numbers?
        </div>
        <div style={{ display: "flex", fontSize: 28, color: SOFT, marginTop: 28, maxWidth: 680 }}>
          Drop a Stripe or accounting export. See the amount in 30 seconds.
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 40 }}>
          {["Free", "File never uploaded", "No account"].map((label, i) => (
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
