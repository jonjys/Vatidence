"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { payBlockedHint, payCtaLabel, stripeChargeNotice } from "@/lib/checkout-copy";
import { CHECKOUT_NETWORK, CHECKOUT_NOT_STARTED, checkoutErrorMessage, readJsonBody } from "@/lib/checkout-error";
import { CONTACT, OPERATOR_TAX_STATUS } from "@/lib/contact";
import { exampleVatListText } from "@/lib/demo-vats";
import { MAX_ROWS, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { MINIMUM_ORDER_MINOR, formatLiveQuoteHint, formatMinor, minimumFloorExplanation, quote } from "@/lib/pricing";
import { parseVat, parseVatList } from "@/lib/vat";

type ApiOk = { checkoutUrl: string; resultUrl: string };
type ApiList = { requesterVat: string; vatNumbers: string[] };

/** State of the "run my previous list again" pre-fill, driven by ?relist=<token>. */
type Relist = { state: "loading" } | { state: "ready"; count: number } | { state: "gone" };

/** A number handed over from the free check, so it lands in the batch. */
export type OrderFormSeed = { vatNumber: string; at: number };

const EXAMPLE_TEXT = exampleVatListText();
const TAX_STATUS_LINE = OPERATOR_TAX_STATUS.replace(/\.$/, "").split(". ").join(" · ");

export function OrderForm({ seed }: { seed?: OrderFormSeed | null } = {}) {
  const [requesterVat, setRequesterVat] = useState("");
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relist, setRelist] = useState<Relist | null>(null);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const relistDone = useRef(false);

  // A previous order can hand its list back to this form via ?relist=<token>.
  // VAT registrations lapse, so the same list is worth re-checking every period;
  // making the customer rebuild it by hand is what stops them coming back.
  useEffect(() => {
    if (relistDone.current) return;
    relistDone.current = true;

    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "1") setCanceled(true);

    const token = params.get("relist");
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
        setExampleLoaded(false);
        // "(purged)" is what a retention sweep leaves behind; never pre-fill it.
        if (body.requesterVat && !body.requesterVat.includes("(")) setRequesterVat(body.requesterVat);
        setRelist({ state: "ready", count: body.vatNumbers.length });
      } catch {
        setRelist({ state: "gone" });
      }
    })();
  }, []);

  // A free check that came back without a consultation number hands its number
  // here. `at` makes a repeat of the same number a distinct event, so checking
  // the same one twice still moves it into the batch.
  const lastSeed = useRef(0);
  useEffect(() => {
    if (!seed || seed.at === lastSeed.current) return;
    lastSeed.current = seed.at;
    setList((prev) => {
      const already = parseVatList(prev, MAX_ROWS).items.some((i) => i.canonical === seed.vatNumber);
      if (already) return prev;
      return prev.trim() ? `${prev.trimEnd()}\n${seed.vatNumber}` : seed.vatNumber;
    });
    setSeedNotice(
      `Added ${seed.vatNumber} from the free check (yes/no only). Enter your own VAT so VIES can issue a consultation number — it is not billed as a row. One number is ${formatMinor(MINIMUM_ORDER_MINOR)}.`,
    );
    setExampleLoaded(false);
    document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [seed]);

  // Parsing runs on the exact same module the server uses, so what the customer
  // is quoted is what the server will charge.
  const deferredList = useDeferredValue(list);
  const parsed = useMemo(() => parseVatList(deferredList, MAX_ROWS), [deferredList]);
  const requester = useMemo(() => (requesterVat.trim() ? parseVat(requesterVat) : null), [requesterVat]);

  const priced = parsed.items.length > 0 ? quote(parsed.items.length) : null;
  const requesterOk = requester?.ok === true;
  const hasBillableItems = parsed.items.length > 0;
  const ready = hasBillableItems && requesterOk && !busy;
  const blockedHint = busy ? null : payBlockedHint({ hasBillableItems, requesterOk });
  const ctaLabel = payCtaLabel({
    busy,
    hasBillableItems,
    requesterOk,
    totalMinor: priced?.totalMinor,
    minimumApplied: priced?.minimumApplied,
  });
  const showingExample = exampleLoaded && list.trim() === EXAMPLE_TEXT;

  async function onFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    const text = await file.text();
    setList((prev) => (prev.trim() ? `${prev}\n${text}` : text));
    setExampleLoaded(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function loadExample() {
    setList(EXAMPLE_TEXT);
    setExampleLoaded(true);
    setSeedNotice(null);
    setError(null);
  }

  function clearList() {
    setList("");
    setExampleLoaded(false);
    setSeedNotice(null);
    setError(null);
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
      const body = await readJsonBody(res);
      if (!res.ok) {
        setError(checkoutErrorMessage(res.status, body));
        setBusy(false);
        return;
      }
      const ok = body as ApiOk;
      if (!ok?.checkoutUrl) {
        setError(CHECKOUT_NOT_STARTED);
        setBusy(false);
        return;
      }
      // Keep the result link locally so a closed tab is never a lost order.
      try {
        localStorage.setItem("viesproof:last-result", ok.resultUrl);
      } catch {
        // private browsing; the success redirect still carries the link
      }
      window.location.href = ok.checkoutUrl;
    } catch {
      setError(CHECKOUT_NETWORK);
      setBusy(false);
    }
  }

  return (
    <div className="panel" id="order">
      <p className="card-title">Pay for consultation numbers</p>
      <p className="card-sub">
        The free check is a yes/no. This step asks VIES for a consultation number on each row. Minimum{" "}
        {formatMinor(MINIMUM_ORDER_MINOR)}, even for one number. Nothing is charged until you confirm on Stripe.
      </p>

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
      {canceled ? (
        <p className="notice">
          Checkout was cancelled. Nothing was charged.
          {relist?.state === "ready"
            ? " Your list is below — enter your own VAT number and pay when you are ready."
            : " Enter your own VAT number and the numbers to verify when you are ready."}
        </p>
      ) : null}
      {seedNotice ? <p className="notice">{seedNotice}</p> : null}

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
          Required so VIES can issue a consultation number. Sent to the Commission as the requester — not added to the
          list you pay for.
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
          onChange={(e) => {
            setList(e.target.value);
            setExampleLoaded(false);
          }}
        />
        <p className="hint">
          One per line, or comma/semicolon/tab separated. Duplicates are removed and never charged twice. Minimum order{" "}
          {formatMinor(MINIMUM_ORDER_MINOR)}
          {parsed.items.length === 0 ? " — even for a single number." : "."}{" "}
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
        <div className="list-actions">
          <button type="button" className="ghost" onClick={loadExample}>
            Load example list
          </button>
          {list.trim() ? (
            <button type="button" className="ghost" onClick={clearList}>
              Clear list
            </button>
          ) : null}
        </div>
        {showingExample ? (
          <p className="notice" style={{ marginTop: 10 }}>
            Example data — format-valid public samples, not your customers. Clear the list before you pay unless you
            want these checked.
          </p>
        ) : null}
      </div>

      <div className="summary">
        <div className="stat">
          <div className="n">{parsed.items.length}</div>
          <div className="k">billable</div>
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
      {parsed.duplicates.length + parsed.rejected.length > 0 ? (
        <p className="hint">
          Charged for {parsed.items.length} billable number{parsed.items.length === 1 ? "" : "s"}
          {parsed.duplicates.length
            ? ` · ${parsed.duplicates.length} duplicate${parsed.duplicates.length === 1 ? "" : "s"} removed`
            : ""}
          {parsed.rejected.length
            ? ` · ${parsed.rejected.length} unusable line${parsed.rejected.length === 1 ? "" : "s"} skipped`
            : ""}
          .
        </p>
      ) : null}

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

      <ul className="pay-needs">
        <li>Your own EU VAT number — required for consultation numbers, not billed as a row</li>
        <li>
          {formatMinor(MINIMUM_ORDER_MINOR)} minimum, even for one number — the €0.39 rate applies once a batch covers
          that floor (13 numbers)
        </li>
        <li>
          <Link href="/refunds">Unanswered rows refunded automatically</Link>
        </li>
      </ul>
      {priced ? <p className="notice pay-charge">{stripeChargeNotice(priced)}</p> : null}

      <div className="payrow">
        <div className="pay-price">
          <div className="price">{priced ? formatMinor(priced.totalMinor) : `from ${formatMinor(MINIMUM_ORDER_MINOR)}`}</div>
          <div className="hint">
            {priced ? formatLiveQuoteHint(priced) : minimumFloorExplanation()}
          </div>
        </div>
        <button type="button" className="pay-cta" onClick={() => void submit()} disabled={!ready}>
          {ctaLabel}
        </button>
      </div>
      {blockedHint ? <p className="hint pay-block">{blockedHint}</p> : null}
      <p className="trust">
        <a href={CONTACT.operatorUrl} rel="noopener">
          {CONTACT.operator}
        </a>
        {" · "}
        {TAX_STATUS_LINE}
        {" · "}
        <Link href="/refunds">Refund policy</Link>
      </p>
    </div>
  );
}
