"use client";

export default function PartnersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>Partners</h1>
      <p role="alert">Something went wrong loading the partner data. Try again.</p>
      <button type="button" onClick={reset}>
        Retry
      </button>
    </main>
  );
}
