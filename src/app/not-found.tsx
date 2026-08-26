import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p className="lede">
        No order exists at this address. Order links look like <code>/r/&lt;token&gt;</code> and are shown at checkout —
        check that the whole link was copied, including the part after the last slash.
      </p>
      <p>
        <Link href="/">Start a new verification</Link>
      </p>
    </>
  );
}
