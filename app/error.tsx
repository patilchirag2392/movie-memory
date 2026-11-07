"use client"; // Error boundaries must be Client Components.

import Link from "next/link";

// Shown when a page under the root layout throws while rendering, e.g. the dashboard or
// onboarding page when the database is unreachable. Without it, Next.js shows its bare default
// error page.
//
// In production, Next.js never sends the real error message to the browser (it may contain
// internals). It sends a generic error with a `digest` ID that matches the server log line, so
// that ID is what we show for support.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-neutral-500">
          We couldn&apos;t load this page right now. Please try again in a moment.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            // retry() re-fetches and re-renders this segment; if it succeeds, the page replaces
            // this error screen.
            onClick={() => retry()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Home
          </Link>
        </div>
        {digest && <p className="text-xs text-neutral-400">Reference: {digest}</p>}
      </div>
    </main>
  );
}
