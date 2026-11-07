"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { FactResponseBody, FactSource, FactView } from "@/lib/facts/types";

type Settled =
  | { status: "ready"; fact: FactView; source: FactSource; nextFactInSeconds: number }
  | { status: "error"; message: string; signedOut: boolean };

type State = Settled | { status: "loading"; previous?: FactView };

// Explains why a fact may be one the user has already seen: the server reuses a fact for 60
// seconds, and serves the last one when OpenAI is unavailable. The button shows the countdown.
const SOURCE_NOTE: Record<Exclude<FactSource, "generated">, string> = {
  cache: "You got this fact less than a minute ago. New facts are available once a minute.",
  stale: "We couldn't get a new fact right now, so here's your most recent one.",
};

/**
 * Plain async function, no React state: calls the API and turns any outcome into the next UI
 * state. The request carries no user id; the server works it out from the session cookie.
 */
async function fetchFact(signal: AbortSignal): Promise<Settled> {
  // 1. The request never got a response: a network problem (or we aborted it ourselves).
  let res: Response;
  try {
    res = await fetch("/api/fact", { cache: "no-store", signal });
  } catch (error) {
    if (!signal.aborted) console.error(error);
    return {
      status: "error",
      message: "Couldn't reach the server. Check your connection and try again.",
      signedOut: false,
    };
  }

  // 2. A response arrived. The body may not be our JSON at all (e.g. an HTML error page from a
  //    proxy), so parse defensively instead of assuming the API's shape.
  const body = (await res.json().catch(() => null)) as FactResponseBody | null;
  if (res.ok && body && "fact" in body) {
    const wait = Number(body.nextFactInSeconds);
    return {
      status: "ready",
      fact: body.fact,
      source: body.source,
      nextFactInSeconds: Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 0,
    };
  }

  // 3. Any other outcome (any non-200, or a 200 without a fact) is an error. Show the API's own
  //    friendly message when it sent one, and a generic friendly one otherwise.
  const apiMessage = body && "error" in body ? body.error?.message : undefined;
  return {
    status: "error",
    message:
      typeof apiMessage === "string" && apiMessage
        ? apiMessage
        : "Something went wrong getting your fun fact. Please try again in a moment.",
    signedOut: res.status === 401,
  };
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

  // Countdown until "Get another" can produce a new fact. The server sends the number of
  // seconds (from its own clock); the browser turns that into an end time on its monotonic
  // clock and re-derives the seconds left on each tick. Re-deriving (rather than subtracting
  // one per tick) keeps it right when a background tab's timers are throttled.
  const [secondsLeft, setSecondsLeft] = useState(0);
  const cooldownEndsAt = useRef(0);
  const coolingDown = secondsLeft > 0;

  useEffect(() => {
    if (!coolingDown) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((cooldownEndsAt.current - performance.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [coolingDown]);

  function start() {
    latest.current?.abort();
    const controller = new AbortController();
    latest.current = controller;
    void fetchFact(controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setState(next);
      const wait = next.status === "ready" ? next.nextFactInSeconds : 0;
      cooldownEndsAt.current = performance.now() + wait * 1000;
      setSecondsLeft(wait);
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
            disabled={loading || coolingDown}
            title={coolingDown ? "Facts refresh at most once a minute" : undefined}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs tabular-nums hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {loading ? "Thinking…" : coolingDown ? `New fact in ${secondsLeft}s` : "Get another"}
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

      {state.status === "ready" && state.source !== "generated" && (
        <p className="text-xs text-neutral-500">{SOURCE_NOTE[state.source]}</p>
      )}

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
