"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { MAX_ROWS, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { formatMinor, quote } from "@/lib/pricing";
import { parseVat, parseVatList } from "@/lib/vat";

type ApiError = { error: string; message?: string };
type ApiOk = { checkoutUrl: string; resultUrl: string };
type ApiList = { requesterVat: string; vatNumbers: string[] };

/** State of the "run my previous list again" pre-fill, driven by ?relist=<token>. */
type Relist = { state: "loading" } | { state: "ready"; count: number } | { state: "gone" };

export function OrderForm() {
  const [requesterVat, setRequesterVat] = useState("");
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relist, setRelist] = useState<Relist | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const relistDone = useRef(false);

  // A previous order can hand its list back to this form via ?relist=<token>.
  // VAT registrations lapse, so the same list is worth re-checking every period;
  // making the customer rebuild it by hand is what stops them coming back.
  useEffect(() => {
    if (relistDone.current) return;
    relistDone.current = true;

    const token = new URLSearchParams(window.location.search).get("relist");
    if (!token || !/^[A-Za-z0-9_-]{6,64}$/.test(token)) return;

    setRelist({ state: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(token)}/list`, { cache: "no-store" });
        if (!res.ok) {
          setRelist({ state: "gone" });
          return;
        }
        const body = (await res.json()) as ApiList;
        if (!Array.isArray(body.vatNumbers) || body.vatNumbers.length === 0) {
          setRelist({ state: "gone" });
          return;
        }
        setList(body.vatNumbers.join("\n"));
        // "(purged)" is what a retention sweep leaves behind; never pre-fill it.
        if (body.requesterVat && !body.requesterVat.includes("(")) setRequesterVat(body.requesterVat);
        setRelist({ state: "ready", count: body.vatNumbers.length });
      } catch {
        setRelist({ state: "gone" });
      }
    })();
  }, []);

  // Parsing runs on the exact same module the server uses, so what the customer
  // is quoted is what the server will charge.
  const deferredList = useDeferredValue(list);
  const parsed = useMemo(() => parseVatList(deferredList, MAX_ROWS), [deferredList]);
  const requester = useMemo(() => (requesterVat.trim() ? parseVat(requesterVat) : null), [requesterVat]);

  const priced = parsed.items.length > 0 ? quote(parsed.items.length) : null;
  const ready = parsed.items.length > 0 && requester?.ok === true && !busy;

  async function onFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    const text = await file.text();
    setList((prev) => (prev.trim() ? `${prev}\n${text}` : text));
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!ready || !requester?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requesterVat: requester.value.canonical,
          vatNumbers: parsed.items.map((i) => i.canonical),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const err = body as ApiError;
        setError(err.message ?? "Could not start checkout. Please try again.");
        setBusy(false);
        return;
      }
      const ok = body as ApiOk;
      // Keep the result link locally so a closed tab is never a lost order.
      try {
        localStorage.setItem("vatproof:last-result", ok.resultUrl);
      } catch {
        // private browsing; the success redirect still carries the link
      }
      window.location.href = ok.checkoutUrl;
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <p className="card-title">Start a verification</p>
      <p className="card-sub">Paste your list, see the price, pay once. Nothing is charged until you confirm.</p>

      {relist?.state === "loading" ? <p className="hint">Loading your previous list…</p> : null}
      {relist?.state === "ready" ? (
        <p className="notice">
          Loaded {relist.count} VAT number{relist.count === 1 ? "" : "s"} from your previous order. Edit the list if it
          has changed, then re-verify to get consultation numbers dated today.
        </p>
      ) : null}
      {relist?.state === "gone" ? (
        <p className="hint">That previous order is no longer available, so the list could not be loaded.</p>
      ) : null}

      <div className="field">
        <label htmlFor="requester">Your own EU VAT number</label>
        <input
          id="requester"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="SE556036079301"
          value={requesterVat}
          onChange={(e) => setRequesterVat(e.target.value)}
        />
        <p className="hint">
          Required. VIES only issues a consultation number when the requester identifies itself — this is what turns a
          lookup into evidence.
        </p>
        {requesterVat.trim() && requester && !requester.ok ? (
          <p className="error" style={{ marginTop: 8 }}>
            {requester.reason}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="list">VAT numbers to verify</label>
        <textarea
          id="list"
          spellCheck={false}
          placeholder={"DE811907980\nFR40303265045\nIT00743110157\n…one per line, or paste a CSV column"}
          value={list}
          onChange={(e) => setList(e.target.value)}
        />
        <p className="hint">
          One per line, or comma/semicolon/tab separated. Duplicates are removed and never charged twice.{" "}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </p>
      </div>

      <div className="summary">
        <div className="stat">
          <div className="n">{parsed.items.length}</div>
          <div className="k">to verify</div>
        </div>
        <div className="stat">
          <div className="n">{parsed.duplicates.length}</div>
          <div className="k">duplicates removed</div>
        </div>
        <div className="stat">
          <div className="n">{parsed.rejected.length}</div>
          <div className="k">unusable</div>
        </div>
      </div>

      {parsed.rejected.length > 0 ? (
        <div className="notice">
          These lines are not valid EU VAT numbers and will be skipped — you are not charged for them.
          <div className="rejects">
            {parsed.rejected.slice(0, 50).map((r, i) => (
              <div key={`${r.input}-${i}`}>
                {r.input} — {r.reason}
              </div>
            ))}
            {parsed.rejected.length > 50 ? <div>…and {parsed.rejected.length - 50} more</div> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="error" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <div className="row" style={{ marginTop: 18 }}>
        <div>
          <div className="price">{priced ? formatMinor(priced.totalMinor) : formatMinor(0)}</div>
          <div className="hint">
            {priced
              ? `${priced.itemCount} number${priced.itemCount === 1 ? "" : "s"} · ${formatMinor(
                  priced.effectiveUnitMinor,
                )} each${priced.minimumApplied ? " (minimum order applied)" : ""} · one-off payment`
              : "Add VAT numbers to see the price."}
          </div>
        </div>
        <button type="button" onClick={() => void submit()} disabled={!ready}>
          {busy ? "Opening checkout…" : "Pay and verify"}
        </button>
      </div>
    </div>
  );
}
