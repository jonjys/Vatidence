"use client";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <h1>Temporarily unavailable</h1>
      <p className="lede">
        Something on our side is not responding right now. Nothing is lost: paid orders keep running in the background
        and your order link stays valid.
      </p>
      <div className="panel">
        <p>If you were in the middle of an order, reload this page in a moment.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </>
  );
}
