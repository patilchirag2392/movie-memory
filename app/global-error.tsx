"use client"; // Error boundaries must be Client Components.

import "./globals.css";

// Last-resort error screen for when the root layout itself fails. It replaces the root layout,
// so it renders its own <html>/<body> and imports the global stylesheet itself (Next.js docs).
// Error boundaries can't export `metadata`, so the tab title uses React's <title> element.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · Movie Memory</title>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4 text-center">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-neutral-500">
              Movie Memory couldn&apos;t load. Please try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
