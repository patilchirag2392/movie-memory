import "server-only";

import { randomUUID } from "node:crypto";

import { FactGenerationError, generateMovieFact } from "@/lib/openai";

import { isFresh } from "./cache";
import { factRepo, type FactRepo, type StoredFact } from "./repo";
import { LEASE_TTL_MS, LOSER_MAX_WAIT_MS, LOSER_POLL_INTERVAL_MS } from "./timing";
import type { FactSource, FactView } from "./types";

/**
 * Everything the service touches outside its own logic, passed in so tests can substitute
 * each piece: a repo against the test DB, a `generate` that fails or counts calls, a fixed
 * `now`, and an instant `sleep`.
 */
export type FactDeps = {
  repo: FactRepo;
  generate: (movie: string) => Promise<string>;
  /** The ONE clock for every timestamp the fact logic writes or compares. */
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
};

const defaultDeps: FactDeps = {
  repo: factRepo,
  generate: generateMovieFact,
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type FactResult =
  | { ok: true; fact: FactView; source: FactSource }
  | { ok: false; reason: "not_onboarded" | "generation_failed" };

/**
 * A fun fact about the user's CURRENT favorite movie.
 *
 * 1. A fact for (user, movie) younger than 60s → return it ("cache"). No OpenAI call.
 * 2. Otherwise, try to take the user's generation lease (one atomic UPDATE in Postgres).
 *    - Won  → re-check the cache, generate, store, release ("generated").
 *    - Lost → another request is already generating: wait for its fact ("cache").
 * 3. If OpenAI fails → the latest fact for (user, current movie), any age ("stale"),
 *    or a friendly error if there is none.
 *
 * `userId` must come from the session. This function trusts it, which is why nothing outside
 * the server (no param, no body field) can supply it.
 */
export async function getFactForUser(
  userId: string,
  deps: FactDeps = defaultDeps,
): Promise<FactResult> {
  const requestStart = deps.now();

  const movie = await deps.repo.getFavoriteMovie(userId);
  if (movie === null) return { ok: false, reason: "not_onboarded" };

  // 1. 60-second cache window.
  const latest = await deps.repo.findLatestFact(userId, movie);
  if (latest && isFresh(latest.createdAt, requestStart)) return success(latest, "cache");

  // 2. Only one request per user may generate at a time.
  const token = randomUUID();
  const leaseUntil = new Date(requestStart.getTime() + LEASE_TTL_MS);
  const won = await deps.repo.acquireLease(userId, token, requestStart, leaseUntil);

  return won
    ? generateHoldingLease(userId, movie, token, deps)
    : waitForLeaseHolder(userId, movie, requestStart, deps);
}

async function generateHoldingLease(
  userId: string,
  movie: string,
  token: string,
  deps: FactDeps,
): Promise<FactResult> {
  try {
    // Double-check: a request that held the lease just before us may have stored a fact between
    // our cache check and our acquiring the lease. Serving it avoids a second, needless call.
    const latest = await deps.repo.findLatestFact(userId, movie);
    if (latest && isFresh(latest.createdAt, deps.now())) return success(latest, "cache");

    let content: string;
    try {
      content = await deps.generate(movie);
    } catch (error) {
      if (!(error instanceof FactGenerationError)) throw error; // a bug, not an OpenAI failure
      console.error("[facts] generation failed", { userId, cause: describe(error.cause ?? error) });
      return fallback(userId, movie, deps);
    }

    // Stamped when stored (not when the request started), so the fact's 60s window starts when
    // it exists, and waiting requests (which look for createdAt >= their own start) find it.
    const fact = await deps.repo.insertFact({ userId, movie, content, createdAt: deps.now() });
    return success(fact, "generated");
  } finally {
    // Always release, including after a failure, so the next request can retry right away
    // instead of waiting out the TTL.
    await deps.repo.releaseLease(userId, token);
  }
}

async function waitForLeaseHolder(
  userId: string,
  movie: string,
  requestStart: Date,
  deps: FactDeps,
): Promise<FactResult> {
  // Bounded by a poll count, not by deps.now(), so a frozen test clock can't loop forever.
  const maxPolls = Math.ceil(LOSER_MAX_WAIT_MS / LOSER_POLL_INTERVAL_MS);

  for (let i = 0; i < maxPolls; i++) {
    await deps.sleep(LOSER_POLL_INTERVAL_MS);

    // Order matters: read the lease BEFORE looking for the fact. The holder stores its fact
    // before releasing, so if the lease was already free when we checked, any fact it made is
    // visible to the query below. Checking the other way round, a fact stored and a lease
    // released between our two reads would look like a failed generation.
    const leaseHeld = await deps.repo.isLeaseHeld(userId, deps.now());

    const fresh = await deps.repo.findFactCreatedSince(userId, movie, requestStart);
    if (fresh) return success(fresh, "cache");

    // The holder finished without storing a fact: its OpenAI call failed. Don't keep waiting,
    // and don't start our own call against a failing API; fall back right away.
    if (!leaseHeld) break;
  }

  return fallback(userId, movie, deps);
}

/** Latest fact for this user's CURRENT movie, any age, or the friendly error. */
async function fallback(userId: string, movie: string, deps: FactDeps): Promise<FactResult> {
  const latest = await deps.repo.findLatestFact(userId, movie);
  return latest ? success(latest, "stale") : { ok: false, reason: "generation_failed" };
}

function success(fact: StoredFact, source: FactSource): FactResult {
  return {
    ok: true,
    source,
    fact: { content: fact.content, movie: fact.movie, createdAt: fact.createdAt.toISOString() },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
