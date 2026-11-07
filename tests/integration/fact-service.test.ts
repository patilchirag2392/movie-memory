import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { factRepo } from "@/lib/facts/repo";
import { getFactForUser, type FactDeps } from "@/lib/facts/service";
import { FactGenerationError } from "@/lib/openai";

import { createFact, createUser, db, factCount, resetDatabase } from "../helpers/db";

// Runs the real service against the real test Postgres. Only OpenAI and time are faked:
// `generate` is a spy we control, and `now` is a clock we move by hand. That combination is
// what lets these tests hit the 60s boundary exactly and simulate OpenAI outages for free.

const T0 = new Date("2026-01-01T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function makeDeps(overrides: Partial<FactDeps> = {}) {
  let clock = T0;
  let n = 0;
  const generate = vi.fn(async (movie: string) => `Fact #${++n} about ${movie}`);
  const deps: FactDeps = {
    repo: factRepo,
    generate,
    now: () => clock,
    sleep: async () => {}, // losers' polling waits are instant in tests
    ...overrides,
  };
  return { deps, generate, setClock: (d: Date) => (clock = d) };
}

const openAiDown = () =>
  vi.fn(async () => {
    throw new FactGenerationError("OpenAI request failed", { cause: new Error("503") });
  });

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {}); // failure paths log on purpose
});

afterAll(async () => {
  await db.$disconnect();
});

describe("60-second cache window", () => {
  it("generates when there is no fact, then serves the cache until 60s, then regenerates", async () => {
    await createUser("u1", "The Matrix");
    const { deps, generate, setClock } = makeDeps();

    const first = await getFactForUser("u1", deps);
    expect(first).toMatchObject({ ok: true, source: "generated", nextFactInSeconds: 60 });
    expect(generate).toHaveBeenCalledTimes(1);

    setClock(at(45_000));
    expect(await getFactForUser("u1", deps)).toMatchObject({ source: "cache", nextFactInSeconds: 15 });

    setClock(at(59_999)); // just inside the window
    const cached = await getFactForUser("u1", deps);
    expect(cached).toMatchObject({ ok: true, source: "cache", nextFactInSeconds: 1 });
    expect(cached.ok && first.ok && cached.fact.content).toBe(first.ok && first.fact.content);
    expect(generate).toHaveBeenCalledTimes(1); // no OpenAI call for a cache hit

    setClock(at(60_000)); // exactly 60s: no longer "less than 60 seconds old"
    const regenerated = await getFactForUser("u1", deps);
    expect(regenerated).toMatchObject({ ok: true, source: "generated" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await factCount("u1")).toBe(2); // every generated fact is stored
  });

  it("stores createdAt from the injected clock, not the database clock", async () => {
    await createUser("u1", "The Matrix");
    const { deps } = makeDeps();

    await getFactForUser("u1", deps);

    const stored = await db.fact.findFirstOrThrow({ where: { userId: "u1" } });
    expect(stored.createdAt.toISOString()).toBe(T0.toISOString());
  });

  it("never serves a fresh fact about a different movie", async () => {
    await createUser("u1", "Up");
    await createFact("u1", "Jaws", "A Jaws fact", T0); // fresh, but for the previous movie
    const { deps, generate } = makeDeps();

    const result = await getFactForUser("u1", deps);

    expect(result).toMatchObject({ ok: true, source: "generated", fact: { movie: "Up" } });
    expect(generate).toHaveBeenCalledWith("Up");
  });

  it("refuses users who haven't picked a movie", async () => {
    await createUser("u1", null);
    const { deps, generate } = makeDeps();

    expect(await getFactForUser("u1", deps)).toEqual({ ok: false, reason: "not_onboarded" });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("OpenAI failure handling", () => {
  it("returns the most recent fact for the current movie, marked stale", async () => {
    await createUser("u1", "Alien");
    await createFact("u1", "Alien", "Older Alien fact", at(-10 * 60_000));
    await createFact("u1", "Alien", "Newest Alien fact", at(-5 * 60_000));
    const { deps } = makeDeps({ generate: openAiDown() });

    const result = await getFactForUser("u1", deps);

    expect(result).toMatchObject({
      ok: true,
      source: "stale",
      fact: { content: "Newest Alien fact", movie: "Alien" },
      nextFactInSeconds: 0, // OpenAI just failed and the lease is free: retrying now is allowed
    });
  });

  it("returns a friendly error when there is no previous fact", async () => {
    await createUser("u1", "Heat");
    const { deps } = makeDeps({ generate: openAiDown() });

    expect(await getFactForUser("u1", deps)).toEqual({ ok: false, reason: "generation_failed" });
  });

  it("does not fall back to a fact about a previous movie", async () => {
    await createUser("u1", "Up");
    await createFact("u1", "Jaws", "A Jaws fact", at(-5 * 60_000));
    const { deps } = makeDeps({ generate: openAiDown() });

    expect(await getFactForUser("u1", deps)).toEqual({ ok: false, reason: "generation_failed" });
  });

  it("releases the generation lease after a failure, so the next request can retry", async () => {
    await createUser("u1", "Heat");
    const failing = makeDeps({ generate: openAiDown() });
    await getFactForUser("u1", failing.deps);

    const user = await db.user.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.factLockToken).toBeNull();

    const working = makeDeps();
    expect(await getFactForUser("u1", working.deps)).toMatchObject({ ok: true, source: "generated" });
  });

  it("rethrows unexpected errors (bugs) instead of hiding them, and still releases the lease", async () => {
    await createUser("u1", "Heat");
    const { deps } = makeDeps({ generate: vi.fn(async () => Promise.reject(new TypeError("bug"))) });

    await expect(getFactForUser("u1", deps)).rejects.toThrow(TypeError);
    const user = await db.user.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.factLockToken).toBeNull();
  });

  it("a failed lease release after a successful insert still returns the generated fact", async () => {
    await createUser("u1", "The Matrix");
    const releaseLease = vi.fn(async () => {
      throw new Error("connection lost");
    });
    const { deps, generate } = makeDeps({ repo: { ...factRepo, releaseLease } });

    const result = await getFactForUser("u1", deps);

    expect(result).toMatchObject({ ok: true, source: "generated", fact: { movie: "The Matrix" } });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(releaseLease).toHaveBeenCalledTimes(1); // it was attempted, and its failure was swallowed
    expect(await factCount("u1")).toBe(1); // the fact really was stored
  });
});

describe("burst protection (concurrent requests, real Postgres)", () => {
  it("5 simultaneous requests make exactly 1 OpenAI call and store exactly 1 fact", async () => {
    await createUser("u1", "Inception");
    // Real clock and a slow generate, so the other 4 requests really arrive while the first
    // is mid-generation. The lease is the only thing stopping them from generating too.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const generate = vi.fn(async (movie: string) => {
      await gate;
      return `The one fact about ${movie}`;
    });
    const deps: FactDeps = {
      repo: factRepo,
      generate,
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms / 10)),
    };

    const pending = Promise.all(Array.from({ length: 5 }, () => getFactForUser("u1", deps)));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1)); // first one is generating
    release();
    const results = await pending;

    expect(generate).toHaveBeenCalledTimes(1);
    expect(await factCount("u1")).toBe(1);
    const contents = results.map((r) => (r.ok ? r.fact.content : r.reason));
    expect(new Set(contents)).toEqual(new Set(["The one fact about Inception"]));
    expect(results.filter((r) => r.ok && r.source === "generated")).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.source === "cache")).toHaveLength(4);
  });

  it("when the lease holder's OpenAI call fails, waiting requests fall back instead of calling OpenAI", async () => {
    await createUser("u1", "Alien");
    await createFact("u1", "Alien", "Old Alien fact", new Date(Date.now() - 5 * 60_000));
    let fail!: () => void;
    const gate = new Promise<void>((resolve) => (fail = resolve));
    const generate = vi.fn(async () => {
      await gate;
      throw new FactGenerationError("OpenAI request failed");
    });
    const deps: FactDeps = {
      repo: factRepo,
      generate,
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms / 10)),
    };

    const pending = Promise.all(Array.from({ length: 3 }, () => getFactForUser("u1", deps)));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    fail();
    const results = await pending;

    expect(generate).toHaveBeenCalledTimes(1); // the waiters did not retry against a failing API
    for (const r of results) {
      expect(r).toMatchObject({ ok: true, source: "stale", fact: { content: "Old Alien fact" } });
    }
  });
});

describe("lease timing", () => {
  it("times the lease from the moment it is acquired, not from when the request started", async () => {
    await createUser("u1", "Heat");
    // First clock read = request start (T0). Every later read is 5s later, as if the queries
    // before acquisition were slow.
    let reads = 0;
    const now = () => (reads++ === 0 ? T0 : at(5_000));
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const generate = vi.fn(async () => {
      await gate;
      return "A Heat fact";
    });
    const { deps } = makeDeps({ now, generate });

    const pending = getFactForUser("u1", deps);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1)); // lease is held now
    const held = await db.user.findUniqueOrThrow({ where: { id: "u1" } });
    finish();
    await pending;

    // LEASE_TTL_MS (20s) after acquisition (T0 + 5s), not after the request started (T0).
    expect(held.factLockUntil?.toISOString()).toBe(at(25_000).toISOString());
  });
});

describe("authorization (service layer)", () => {
  it("only ever reads and writes the given user's facts", async () => {
    await createUser("alice", "The Matrix");
    await createUser("bob", "The Matrix"); // same movie on purpose
    await createFact("bob", "The Matrix", "Bob's private fact", T0); // fresh
    const { deps, generate } = makeDeps();

    const result = await getFactForUser("alice", deps);

    // Bob's fresh fact for the same movie is NOT served to Alice as a cache hit.
    expect(result).toMatchObject({ ok: true, source: "generated" });
    expect(result.ok && result.fact.content).not.toBe("Bob's private fact");
    expect(generate).toHaveBeenCalledTimes(1);
    // And Bob's data is untouched.
    expect(await factCount("bob")).toBe(1);
    expect(await factCount("alice")).toBe(1);
  });

  it("does not fall back to another user's fact when OpenAI fails", async () => {
    await createUser("alice", "Alien");
    await createUser("bob", "Alien");
    await createFact("bob", "Alien", "Bob's Alien fact", at(-5 * 60_000));
    const { deps } = makeDeps({ generate: openAiDown() });

    expect(await getFactForUser("alice", deps)).toEqual({ ok: false, reason: "generation_failed" });
  });
});
