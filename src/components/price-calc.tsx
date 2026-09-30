"use client";

import { useState } from "react";
import { MAX_ROWS } from "@/lib/limits";
import { MINIMUM_ORDER_MINOR, formatMinor, quote } from "@/lib/pricing";

/**
 * Drag to a batch size, see what it costs. Runs the same quote() the order
 * form and the server use, so the number here is the number at checkout.
 */
const STOPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, MAX_ROWS] as const;
const DEFAULT_STOP = STOPS.indexOf(100);
/** Labels under the slider, placed at their own stop so the scale reads true. */
const SCALE = [1, 100, 1000, MAX_ROWS] as const;

/** A rough, stated assumption: one manual lookup on the VIES website. */
const MANUAL_SECONDS_PER_LOOKUP = 40;

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function PriceCalc() {
  const [stop, setStop] = useState(DEFAULT_STOP);
  const count = STOPS[stop] ?? 100;
  const q = quote(count);

  return (
    <div className="card calc">
      <div className="calc-grid">
        <div>
          <label htmlFor="calc-range" className="kicker">
            How many VAT numbers?
          </label>
          <p className="calc-count" aria-live="polite">
            <strong>{count.toLocaleString("en-GB")}</strong>
            <span>number{count === 1 ? "" : "s"}</span>
          </p>
          <input
            id="calc-range"
            type="range"
            min={0}
            max={STOPS.length - 1}
            step={1}
            value={stop}
            aria-valuetext={`${count} VAT numbers`}
            onChange={(e) => setStop(Number(e.target.value))}
          />
          <div className="calc-scale" aria-hidden="true">
            {SCALE.map((n) => (
              <span key={n} style={{ left: `${(STOPS.indexOf(n) / (STOPS.length - 1)) * 100}%` }}>
                {n.toLocaleString("en-GB")}
              </span>
            ))}
          </div>
        </div>

        <div className="calc-out">
          <p className="kicker">One payment</p>
          <p className="total">{formatMinor(q.totalMinor)}</p>
          <dl>
            <dt>Per number</dt>
            <dd>{formatMinor(q.effectiveUnitMinor)}</dd>
            <dt>By hand on VIES</dt>
            <dd>~{duration(count * MANUAL_SECONDS_PER_LOOKUP)}</dd>
            <dt>Consultation numbers</dt>
            <dd>{count.toLocaleString("en-GB")}</dd>
          </dl>
          <a href="#order" className="btn btn-accent">
            Verify {count === 1 ? "one number" : `${count.toLocaleString("en-GB")} numbers`}{" "}
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </a>
          <p className="fine">
            {q.minimumApplied
              ? `Minimum order ${formatMinor(MINIMUM_ORDER_MINOR)} applies at this size. `
              : ""}
            Manual time assumes about {MANUAL_SECONDS_PER_LOOKUP} seconds per lookup on the VIES website.
          </p>
        </div>
      </div>
    </div>
  );
}
