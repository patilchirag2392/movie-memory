"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { FactResponseBody, FactView } from "@/lib/facts/types";

type Settled =
  | { status: "ready"; fact: FactView }
  | { status: "error"; message: string; signedOut: boolean };

type State = Settled | { status: "loading"; previous?: FactView };

/**
 * Plain async function, no React state: calls the API and turns any outcome into the next UI
 * state. The request carries no user id; the server works it out from the session cookie.
 */
async function fetchFact(signal: AbortSignal): Promise<Settled> {
  try {
    const res = await fetch("/api/fact", { cache: "no-store", signal });
    const body = (await res.json()) as FactResponseBody;
    if ("fact" in body) return { status: "ready", fact: body.fact };
    return { status: "error", message: body.error.message, signedOut: res.status === 401 };
  } catch (error) {
    if (!signal.aborted) console.error(error);
    return {
      status: "error",
      message: "Couldn't reach the server. Check your connection and try again.",
      signedOut: false,
    };
  }
}

/**
 * Loads the fact in the browser after the page renders, so a slow OpenAI call never delays the
 * rest of the dashboard.
 */
export function FactCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  // Only the most recent request may update the UI: starting a new one aborts the previous
  // one, so a slow earlier response can't overwrite a newer one (or update after unmount).
  const latest = useRef<AbortController | null>(null);

  function start() {
    latest.current?.abort();
    const controller = new AbortController();
    latest.current = controller;
    void fetchFact(controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
  }

  useEffect(() => {
    start(); // initial state is already "loading"; state is only set when the response arrives
    return () => latest.current?.abort();
  }, []);

  function refresh() {
    setState((s) => ({ status: "loading", previous: s.status === "ready" ? s.fact : undefined }));
    start();
  }

  const loading = state.status === "loading";
  const shown =
    state.status === "ready" ? state.fact : state.status === "loading" ? state.previous : undefined;

  return (
    <section
      aria-busy={loading}
      className="space-y-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Fun fact</h2>
        {!(state.status === "error" && state.signedOut) && (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {loading ? "Thinking…" : "Get another"}
          </button>
        )}
      </div>

      {shown ? (
        <p className={`leading-relaxed ${loading ? "opacity-50" : ""}`}>{shown.content}</p>
      ) : loading ? (
        <div className="space-y-2" aria-label="Loading a fun fact">
          <div className="h-4 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
      ) : null}

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}{" "}
          {state.signedOut && (
            <Link href="/" className="underline">
              Sign in
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
