import { CACHE_WINDOW_MS } from "./timing";

/**
 * The 60-second rule, as a pure function so tests can pin the boundary exactly.
 * "Less than 60 seconds old" is fresh: exactly 60s is NOT fresh, so it regenerates.
 * Both timestamps come from the same app clock (see the Fact model), so no DB clock is involved.
 */
export function isFresh(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < CACHE_WINDOW_MS;
}
