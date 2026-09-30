import Link from "next/link";

/** The Nytto Labs mark (ink tile, accent dot) beside the product name. */
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Vatidence home">
      <span className="logo-mark" aria-hidden="true">
        <span />
      </span>
      <span className="logo-word">
        Vat<b>idence</b>
      </span>
    </Link>
  );
}
