import { describe, expect, it } from "vitest";

import { isFresh, secondsUntilNewFact } from "@/lib/facts/cache";
import { CACHE_WINDOW_MS } from "@/lib/facts/timing";

// The spec: "less than 60 seconds old → cached; older → generate". These pin the boundary to
// the millisecond, which only works because one injected clock is used everywhere.
describe("isFresh (60-second cache window)", () => {
  const createdAt = new Date("2026-01-01T12:00:00.000Z");
  const after = (ms: number) => new Date(createdAt.getTime() + ms);

  it("uses a 60 second window", () => {
    expect(CACHE_WINDOW_MS).toBe(60_000);
  });

  it("is fresh immediately after creation", () => {
    expect(isFresh(createdAt, after(0))).toBe(true);
  });

  it("is fresh at 59.999s", () => {
    expect(isFresh(createdAt, after(59_999))).toBe(true);
  });

  it("is NOT fresh at exactly 60s ('less than 60 seconds' excludes 60)", () => {
    expect(isFresh(createdAt, after(60_000))).toBe(false);
  });

  it("is not fresh after 60s", () => {
    expect(isFresh(createdAt, after(61_000))).toBe(false);
    expect(isFresh(createdAt, after(24 * 60 * 60 * 1000))).toBe(false);
  });
});

describe("secondsUntilNewFact (countdown sent to the fact card)", () => {
  const createdAt = new Date("2026-01-01T12:00:00.000Z");
  const after = (ms: number) => new Date(createdAt.getTime() + ms);

  it("is 60 right after a fact is created", () => {
    expect(secondsUntilNewFact(createdAt, after(0))).toBe(60);
  });

  it("rounds up, so it never says 0 while the fact is still served from cache", () => {
    expect(secondsUntilNewFact(createdAt, after(45_000))).toBe(15);
    expect(secondsUntilNewFact(createdAt, after(45_001))).toBe(15);
    expect(secondsUntilNewFact(createdAt, after(59_999))).toBe(1);
    expect(isFresh(createdAt, after(59_999))).toBe(true); // consistent with the cache rule
  });

  it("is 0 exactly when the fact stops being fresh, and stays 0 after", () => {
    expect(secondsUntilNewFact(createdAt, after(60_000))).toBe(0);
    expect(isFresh(createdAt, after(60_000))).toBe(false);
    expect(secondsUntilNewFact(createdAt, after(10 * 60_000))).toBe(0);
  });
});
