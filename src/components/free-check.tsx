"use client";

import { useState } from "react";
import { MINIMUM_ORDER_MINOR, formatMinor } from "@/lib/pricing";
import { parseVat } from "@/lib/vat";

type CheckOk = {
  vatNumber: string;
  valid: boolean;
  name: string | null;
  address: string | null;
  checkedAt: string | null;
};
type CheckErr = { error: string; message?: string };

/**
 * Public, registered numbers a stranger can try with one tap, so the first
 * thing the page does for them is answer something. One of them is German on
 * purpose: Germany discloses validity only, and seeing that before paying is
 * better than discovering it in the evidence pack.
 */
const TRY_NUMBERS = ["SE556703748501", "IE6388047V", "DE811907980"] as const;

export function FreeCheck({ onEscalate }: { onEscalate: (vatNumber: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = value.trim() ? parseVat(value) : null;
  const ready = parsed?.ok === true && !busy;

  async function run(raw: string = value) {
    const target = raw.trim() ? parseVat(raw) : null;
    if (busy || !target?.ok) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vatNumber: target.value.canonical }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        setError((body as CheckErr).message ?? "That check could not be completed.");
      } else {
        setResult(body as CheckOk);
      }
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  function tryNumber(vatNumber: string) {
    setValue(vatNumber);
    void run(vatNumber);
  }

  return (
    <div className="checkcard free" id="check">
      <div className="checkcard-head">
        <p className="card-title">Check one number, free</p>
        <span className="live">
          <i aria-hidden="true" />
          Live VIES
        </span>
      </div>
      <p className="card-sub">
        Straight from the European Commission&apos;s VIES service. No account, no payment, no catch.
      </p>

      <div className="checkrow">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="EU VAT number to check"
          placeholder="DE811907980"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button type="button" onClick={() => void run()} disabled={!ready}>
          {busy ? "Checking…" : "Check"}
          {busy ? null : (
            <span className="arrow" aria-hidden="true">
              →
            </span>
          )}
        </button>
      </div>

      <div className="tries">
        <span>Or try one:</span>
        {TRY_NUMBERS.map((n) => (
          <button key={n} type="button" onClick={() => tryNumber(n)} disabled={busy}>
            {n}
          </button>
        ))}
      </div>

      {value.trim() && parsed && !parsed.ok ? <p className="error">{parsed.reason}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div aria-live="polite">
        {result ? (
          <div className="verdict">
            <div className="flagrow">
              <span className={result.valid ? "flag-icon ok" : "flag-icon bad"} aria-hidden="true">
                {result.valid ? "✓" : "✕"}
              </span>
              <div>
                <p className={result.valid ? "flag ok" : "flag bad"}>
                  {result.vatNumber} — {result.valid ? "registered for VAT" : "not a valid VAT number"}
                </p>
                {result.name ? <p className="who">{result.name}</p> : null}
                {result.address ? <p className="who dim">{result.address}</p> : null}
                {result.valid && !result.name && !result.address ? (
                  <p className="who dim">
                    This member state discloses validity only — no name or address. Several do, Germany included.
                  </p>
                ) : null}
              </div>
            </div>

            {/*
              The honest part, and the whole business model. VIES issues a
              consultation number only when the requester identifies itself, so
              this free answer genuinely has none - and a yes/no with no
              identifier is not evidence of anything.
            */}
            <div className="gap">
              <p className="gap-id">
                <span>Consultation number</span>
                <s>none issued</s>
              </p>
              <p>
                <strong>This answer carries no consultation number.</strong> VIES issues one only when the requester
                gives their own VAT number, and that identifier records who checked, which number, and when.
              </p>
              <p className="escalate-note">
                Next step is a paid verification so VIES can issue a consultation number. {result.vatNumber} will be
                added to the list below.
              </p>
              <button type="button" className="escalate" onClick={() => onEscalate(result.vatNumber)}>
                Start a paid verification — from {formatMinor(MINIMUM_ORDER_MINOR)}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
