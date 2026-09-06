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

export function FreeCheck({ onEscalate }: { onEscalate: (vatNumber: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = value.trim() ? parseVat(value) : null;
  const ready = parsed?.ok === true && !busy;

  async function run() {
    if (!ready || !parsed?.ok) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vatNumber: parsed.value.canonical }),
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

  return (
    <div className="panel free">
      <p className="card-title">Check one number, free</p>
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
        </button>
      </div>

      {value.trim() && parsed && !parsed.ok ? <p className="error">{parsed.reason}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <div className="verdict">
          <p className={result.valid ? "flag ok" : "flag bad"}>
            {result.vatNumber} — {result.valid ? "registered for VAT" : "not a valid VAT number"}
          </p>
          {result.name ? <p className="who">{result.name}</p> : null}
          {result.address ? <p className="who dim">{result.address}</p> : null}

          {/*
            The honest part, and the whole business model. VIES issues a
            consultation number only when the requester identifies itself, so
            this free answer genuinely has none - and a yes/no with no
            identifier is not evidence of anything.
          */}
          <div className="gap">
            <p>
              <strong>This answer carries no consultation number.</strong> VIES issues one only when the requester
              gives their own VAT number, and that identifier records who checked, which number, and when.
            </p>
            <p className="escalate-note">{result.vatNumber} will be added to the list below.</p>
            <button type="button" className="escalate" onClick={() => onEscalate(result.vatNumber)}>
              Get the consultation number — from {formatMinor(MINIMUM_ORDER_MINOR)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
