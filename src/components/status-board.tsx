"use client";

import Link from "next/link";
import { useViesStatus } from "@/components/use-vies-status";
import { COUNTRIES } from "@/lib/countries";
import { summarize, type Availability, type ViesStatus } from "@/lib/vies-status";

const LABEL: Record<Availability, string> = {
  available: "Answering",
  unavailable: "Not answering",
  unknown: "No signal",
};

const nameOf = (code: keyof typeof COUNTRIES) => COUNTRIES[code].name;

/** HH:MM UTC from an ISO timestamp: identical on server and client, so hydration never disagrees. */
export function utcClock(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

/** The full board on /status: a one-line verdict and a tile per member state, refreshed every minute. */
export function StatusBoard({ initial }: { initial: ViesStatus }) {
  const status = useViesStatus(initial, { poll: true }) ?? initial;
  const summary = summarize(status, nameOf);

  return (
    <div className="status-board">
      <div className={`status-banner tone-${summary.tone}`} role="status" aria-live="polite">
        <span className="status-light" aria-hidden="true" />
        <div>
          <p className="status-headline">{summary.headline}</p>
          <p className="status-meta">
            Checked {utcClock(status.checkedAt)} · refreshes every minute · source: European Commission VIES
          </p>
        </div>
      </div>

      <ul className="ms-grid" aria-label="Availability by member state">
        {status.countries.map(({ countryCode, availability }) => (
          <li key={countryCode} className={`ms ms-${availability}`}>
            <b>{countryCode}</b>
            <span className="ms-name">{nameOf(countryCode)}</span>
            <span className="ms-state">
              <i aria-hidden="true" />
              {LABEL[availability]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The small pill on the free check. It links to the board, and turns amber
 * the moment any member state stops answering - which is when a stranger's
 * first check is most likely to fail and most needs an explanation.
 */
export function StatusChip() {
  const status = useViesStatus();
  const summary = status ? summarize(status, nameOf) : null;

  let detail = "";
  let tone = "ok";
  if (summary?.tone === "partial") {
    tone = "partial";
    detail = summary.unavailable.length === 1 ? ` · ${summary.unavailable[0]} down` : ` · ${summary.unavailable.length} down`;
  } else if (summary?.tone === "down") {
    tone = "down";
    detail = " · down";
  }

  return (
    <Link
      href="/vies-status"
      className={`live live-${tone}`}
      title={summary ? summary.headline : "Live availability of every member state's VIES service"}
    >
      <i aria-hidden="true" />
      Live VIES{detail}
    </Link>
  );
}
