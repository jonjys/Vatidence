"use client";

import { useRef, useState, type KeyboardEvent } from "react";

/**
 * The whole business in one toggle: the same VIES call, answered with and
 * without a requester. The answer differs in exactly one field. The field
 * names and the empty requestIdentifier are what the REST API really returns;
 * the identifier value is illustrative, because its format differs between
 * member states.
 */
const CASES = [
  {
    id: "without",
    tab: "Without your VAT number",
    request: "POST /check-vat-number  { countryCode, vatNumber }",
    identifier: "",
    verdict: "A yes/no. Nothing records that you checked, or when.",
    good: false,
  },
  {
    id: "with",
    tab: "With your VAT number",
    request: "POST /check-vat-number  { countryCode, vatNumber, requesterMemberStateCode, requesterNumber }",
    identifier: "WAPIAAAAaBDiifgO",
    verdict: "A consultation number: who checked, which number, and when. Every Vatidence row carries one.",
    good: true,
  },
] as const;

export function ViesDemo() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const c = CASES[active]!;

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const delta = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = (active + delta + CASES.length) % CASES.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="split">
      <div>
        <p className="kicker">The difference</p>
        <h2 className="h2">Same number. Only one answer is a record.</h2>
        <p className="lead">
          Checking a VAT number on the VIES website without entering your own VAT number returns a yes/no and nothing
          else. Enter your own number and VIES returns a unique consultation number that records who checked, which
          number, and when — VIES itself will give you this for a single lookup. Vatidence always sends the requester
          identity, so every paid row includes that number without you typing it in by hand.
        </p>
        <div className="tabs" role="tablist" aria-label="VIES response" onKeyDown={onKey}>
          {CASES.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`vies-tab-${item.id}`}
              aria-controls="vies-panel"
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
            >
              {item.tab}
            </button>
          ))}
        </div>
      </div>

      <div id="vies-panel" role="tabpanel" aria-labelledby={`vies-tab-${c.id}`}>
        <div className="response swap" key={c.id}>
          <div className="response-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>{c.request}</span>
          </div>
          <pre>
            {"{\n"}
            <span className="k">  &quot;countryCode&quot;</span>: <span className="s">&quot;IE&quot;</span>,{"\n"}
            <span className="k">  &quot;vatNumber&quot;</span>: <span className="s">&quot;8280018G&quot;</span>,{"\n"}
            <span className="k">  &quot;valid&quot;</span>: <span className="t">true</span>,{"\n"}
            <span className="k">  &quot;requestDate&quot;</span>: <span className="s">&quot;2026-09-30T11:11:38Z&quot;</span>,{"\n"}
            {"  "}
            <span className={c.good ? "hl full" : "hl empty"}>
              <span className="k">&quot;requestIdentifier&quot;</span>:{" "}
              <span className="s">&quot;{c.identifier}&quot;</span>
            </span>
            {"\n}"}
          </pre>
          <div className={c.good ? "response-verdict good" : "response-verdict"}>
            <b aria-hidden="true">{c.good ? "✓" : "?"}</b>
            <span>{c.verdict}</span>
          </div>
        </div>
        <p className="response-note">
          The shape of a real VIES answer, trimmed. Identifier formats vary by member state.
        </p>
      </div>
    </div>
  );
}
