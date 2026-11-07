import { OPENAI_DEADLINE_MS } from "@/lib/openai";

/** A fact younger than this is served from the DB instead of generating a new one. */
export const CACHE_WINDOW_MS = 60_000;

/**
 * Burst-protection timings. They must satisfy:
 *
 *   OPENAI_DEADLINE_MS (10s)  <  LOSER_MAX_WAIT_MS (12s)  <  LEASE_TTL_MS (20s)
 *
 * - Deadline < TTL: the request holding the lease always finishes (or gives up) before the lease
 *   can expire. If the lease expired under a live request, a second request could take it and
 *   generate a duplicate, which is exactly what the lease exists to prevent.
 * - Deadline < loser wait: a request that lost the race waits at least as long as the winner can
 *   take, so it normally gets the winner's fact instead of timing out.
 * - The TTL only matters when a holder dies without releasing (crash, killed process). The next
 *   request can then take over after at most LEASE_TTL_MS.
 */
export const LOSER_MAX_WAIT_MS = 12_000;
export const LEASE_TTL_MS = 20_000;
export const LOSER_POLL_INTERVAL_MS = 500;

// Fail at startup, not in production traffic, if someone edits one number and breaks the chain.
if (!(OPENAI_DEADLINE_MS < LOSER_MAX_WAIT_MS && LOSER_MAX_WAIT_MS < LEASE_TTL_MS)) {
  throw new Error("Fact timing invariant violated: need deadline < loser wait < lease TTL");
}

export { OPENAI_DEADLINE_MS };
