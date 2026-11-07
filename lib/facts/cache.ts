import { CACHE_WINDOW_MS } from "./timing";

/**
 * The 60-second rule, as a pure function so tests can pin the boundary exactly.
 * "Less than 60 seconds old" is fresh: exactly 60s is NOT fresh, so it regenerates.
 * Both timestamps come from the same app clock (see the Fact model), so no DB clock is involved.
 */
export function isFresh(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < CACHE_WINDOW_MS;
}

/**
 * Whole seconds until this fact stops being fresh, i.e. until "Get another" can produce a new
 * fact. 0 means a new one can be generated now. Rounded up, so the UI never says "0s" while
 * the server would still answer from the cache.
 *
 * Computed on the server, with the same clock as isFresh. The browser only counts this number
 * down; it never compares its own clock with createdAt, so a wrong client clock can't skew it.
 */
export function secondsUntilNewFact(createdAt: Date, now: Date): number {
  const remainingMs = createdAt.getTime() + CACHE_WINDOW_MS - now.getTime();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
