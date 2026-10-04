"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StatusChip } from "@/components/status-board";
import { useViesStatus } from "@/components/use-vies-status";
import { countryFromInput } from "@/lib/countries";
import { MINIMUM_ORDER_MINOR, formatMinor, quote } from "@/lib/pricing";
import { parseVat } from "@/lib/vat";

type CheckOk = {
  vatNumber: string;
  valid: boolean;
  name: string | null;
  address: string | null;
  checkedAt: string | null;
};
type CheckErr = { error: string; message?: string; retryable?: boolean };

/**
 * Registered numbers a stranger can try with one tap, so the first thing the
 * page does for them is answer something. Each belongs to a company that
 * publishes it itself - never a household brand, which would read as a
 * customer, and never a sole trader: a Swedish sole trader's VAT number
 * contains their personnummer. The German one is there on purpose: Germany
 * discloses validity only, and seeing that before paying is better than
 * discovering it in the evidence pack.
 *
 * SE: Mosslunda Snickeri AB · IE: Combilift (imprint page) ·
 * DE: Schreiner Group GmbH & Co. KG (Impressum). All valid in VIES 2026-09-30.
 */
const TRY_NUMBERS = ["SE556566943801", "IE8280018G", "DE130745279"] as const;

/** The price of a list, quoted in the upsell so "a list" has a number attached. */
const LIST_EXAMPLE = 100;

/** "2026-10-04T09:14:03.123Z" → "4 Oct 2026, 09:14 UTC"; a bare date stays a date. */
function whenChecked(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return /T\d{2}:\d{2}/.test(iso) ? `${date}, ${d.toISOString().slice(11, 16)} UTC` : date;
}

export function FreeCheck({
  onEscalate,
  initialValue = "",
  autoRun = false,
}: {
  onEscalate: (vatNumber: string) => void;
  /** Pre-filled from a shared /check/<number> link. */
  initialValue?: string;
  /** Run the pre-filled number once on load: a shared link should answer, not ask. */
  autoRun?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<CheckOk | null>(null);
  const [error, setError] = useState<{ message: string; upstream: boolean } | null>(null);
  const [copied, setCopied] = useState<"link" | "result" | null>(null);
  const status = useViesStatus();
  const autoRan = useRef(false);

  const parsed = value.trim() ? parseVat(value) : null;
  const country = countryFromInput(value);
  const ready = parsed?.ok === true && !busy;
  const countryDown =
    country !== null && status?.countries.some((c) => c.countryCode === country.code && c.availability === "unavailable");

  // Typing "D" is not a mistake yet. The format is described while someone
  // types and only called an error once they leave the field or press Check.
  const showError = touched && value.trim() !== "" && parsed !== null && !parsed.ok;
  const formatHint = country ? `${country.name}: ${country.code} + ${country.format}` : null;
  const errorText = parsed && !parsed.ok
    ? country
      ? `Not a valid format for ${country.name}: ${country.code} + ${country.format}, e.g. ${country.example}.`
      : `${parsed.reason.charAt(0).toUpperCase()}${parsed.reason.slice(1)}.`
    : null;

  async function run(raw: string = value) {
    setTouched(true);
    const target = raw.trim() ? parseVat(raw) : null;
    if (busy || !target?.ok) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vatNumber: target.value.canonical }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const err = body as CheckErr;
        setError({
          message: err.message ?? "That check could not be completed.",
          upstream: err.error === "upstream_unavailable",
        });
      } else {
        setResult(body as CheckOk);
      }
    } catch {
      setError({ message: "Network error. Try again.", upstream: false });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!autoRun || autoRan.current || !initialValue) return;
    autoRan.current = true;
    void run(initialValue);
    // run() is stable enough for a one-shot; re-running on every render is the bug to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialValue]);

  function tryNumber(vatNumber: string) {
    setValue(vatNumber);
    void run(vatNumber);
  }

  async function copy(kind: "link" | "result") {
    if (!result) return;
    const link = `${window.location.origin}/check/${result.vatNumber}`;
    const when = whenChecked(result.checkedAt);
    const text =
      kind === "link"
        ? link
        : [
            `${result.vatNumber}: ${result.valid ? "valid, registered for VAT" : "not valid"} (EU VIES${when ? `, ${when}` : ""})`,
            result.name ?? null,
            "Checked without a requester, so no VIES consultation number was issued.",
            `Check again: ${link}`,
          ]
            .filter(Boolean)
            .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  // A demo number from a member state that is down right now would fail on the
  // first tap, which is the worst possible first impression.
  const tries = TRY_NUMBERS.filter(
    (n) => !status?.countries.some((c) => c.countryCode === n.slice(0, 2) && c.availability === "unavailable"),
  );
  const listPrice = formatMinor(quote(LIST_EXAMPLE).totalMinor);

  return (
    <div className="checkcard free" id="check">
      <div className="checkcard-head">
        <p className="card-title">Check one number, free</p>
        <StatusChip />
      </div>
      <p className="card-sub">
        Straight from the European Commission&apos;s VIES service. No account, no payment, no catch.
      </p>

      <div className="checkrow">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="EU VAT number to check"
          aria-invalid={showError ? true : undefined}
          aria-describedby="check-hint"
          placeholder="DE811907980"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (touched && parseVat(e.target.value).ok) setTouched(false);
          }}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button type="button" onClick={() => void run()} disabled={busy || !value.trim()}>
          {busy ? "Checking…" : "Check"}
          {busy ? null : (
            <span className="arrow" aria-hidden="true">
              →
            </span>
          )}
        </button>
      </div>

      <p id="check-hint" className={showError ? "fmt-hint fmt-bad" : ready ? "fmt-hint fmt-ok" : "fmt-hint"}>
        {showError
          ? errorText
          : ready && country
            ? `✓ ${country.name} format`
            : formatHint ?? "Starts with the 2-letter country code, e.g. DE, FR, SE. Spaces and dots are fine."}
      </p>

      {countryDown && country ? (
        <p className="notice">
          {country.name}&apos;s VIES service is not answering right now (
          <Link href="/vies-status">live status</Link>), so this check will probably fail until it is back.
        </p>
      ) : null}

      {tries.length > 0 ? (
        <div className="tries">
          <span>Or try one:</span>
          {tries.map((n) => (
            <button key={n} type="button" onClick={() => tryNumber(n)} disabled={busy}>
              {n}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error.message}
          {error.upstream ? (
            <>
              {" "}
              <Link href="/vies-status">See which member states are down</Link>. A paid order does not need to wait:
              rows retry automatically and are refunded if never answered.
            </>
          ) : null}
        </p>
      ) : null}

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
                {whenChecked(result.checkedAt) ? (
                  <p className="who dim when">Answered by VIES · {whenChecked(result.checkedAt)}</p>
                ) : null}
              </div>
            </div>

            <div className="verdict-actions">
              <button type="button" className="ghost" onClick={() => void copy("link")}>
                {copied === "link" ? "Link copied" : "Copy link"}
              </button>
              <button type="button" className="ghost" onClick={() => void copy("result")}>
                {copied === "result" ? "Result copied" : "Copy result"}
              </button>
            </div>

            {/*
              The honest part, and the whole business model. VIES issues a
              consultation number only when the requester identifies itself, so
              this free answer genuinely has none - and a yes/no with no
              identifier is not evidence of anything. For one number, the VIES
              website will issue one for free; what is worth paying for is the
              whole customer list, done at once and filed.
            */}
            <div className="gap">
              <p className="gap-id">
                <span>Consultation number</span>
                <em>none issued</em>
              </p>
              <p>
                <strong>This answer is a yes/no, not a record.</strong> VIES issues a consultation number only when the
                requester gives their own VAT number. For one number you can do that yourself on the VIES website.
              </p>
              <p className="escalate-note">
                Checking your customers every quarter? Verify the whole list at once and get every consultation number in
                one sealed PDF and CSV: {LIST_EXAMPLE} numbers cost {listPrice}, from {formatMinor(MINIMUM_ORDER_MINOR)}.
              </p>
              <button type="button" className="escalate" onClick={() => onEscalate(result.vatNumber)}>
                Add {result.vatNumber} to a list verification
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
