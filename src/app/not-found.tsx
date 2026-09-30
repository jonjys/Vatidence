import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <p className="kicker">404</p>
      <h1>Not found</h1>
      <p className="lede">
        No order exists at this address. Order links look like <code>/r/&lt;token&gt;</code> and are shown at checkout —
        check that the whole link was copied, including the part after the last slash.
      </p>
      <p>
        <Link href="/" className="btn">
          Start a new verification <span className="arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
