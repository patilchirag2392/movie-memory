import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FactResponseBody } from "@/lib/facts/types";

import { createFact, createUser, db, factCount, resetDatabase } from "../helpers/db";

// Tests the real GET /api/fact handler against the test DB. Only two things are replaced:
// - `@/auth`: decides who the session belongs to (what Auth.js would read from the cookie),
// - `generateMovieFact`: no network calls.
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {}, // only meaningful inside a Next.js render
}));

vi.mock("@/lib/openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openai")>()),
  generateMovieFact: vi.fn(async (movie: string) => `Generated fact about ${movie}`),
}));

const { GET } = await import("@/app/api/fact/route");

/**
 * The handler's signature takes no request at all, so it has no way to read a query string.
 * This helper still hands it a request with ?userId=..., as an attacker would send, to show
 * that supplying another user's id changes nothing.
 */
async function callRoute(query = "") {
  const handler = GET as unknown as (req: Request) => Promise<Response>;
  const res = await handler(new Request(`http://localhost/api/fact${query}`));
  return { res, body: (await res.json()) as FactResponseBody };
}

beforeEach(async () => {
  await resetDatabase();
  session.userId = null;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("GET /api/fact authorization", () => {
  it("returns 401 without a session and touches nothing", async () => {
    await createUser("bob", "The Matrix");
    await createFact("bob", "The Matrix", "Bob's private fact", new Date());

    const { res, body } = await callRoute("?userId=bob");

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: { code: "unauthenticated", message: expect.any(String) } });
    expect(JSON.stringify(body)).not.toContain("Bob's private fact");
  });

  it("ignores ?userId and returns only the session user's fact", async () => {
    await createUser("alice", "Spirited Away");
    await createUser("bob", "The Matrix");
    await createFact("bob", "The Matrix", "Bob's private fact", new Date()); // fresh: a cache hit for Bob
    session.userId = "alice";

    const { res, body } = await callRoute("?userId=bob");

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ fact: { movie: "Spirited Away" }, source: "generated" });
    expect(JSON.stringify(body)).not.toContain("Bob's private fact");
    expect(await factCount("alice")).toBe(1); // created for Alice...
    expect(await factCount("bob")).toBe(1); // ...and Bob's facts are untouched
  });

  it("returns 409 when the session user hasn't onboarded, even if ?userId names one who has", async () => {
    await createUser("alice", null);
    await createUser("bob", "The Matrix");
    await createFact("bob", "The Matrix", "Bob's private fact", new Date());
    session.userId = "alice";

    const { res, body } = await callRoute("?userId=bob");

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "not_onboarded" } });
  });

  it("marks every response as not cacheable by browsers or proxies", async () => {
    await createUser("alice", "Spirited Away");

    const signedOut = await callRoute();
    session.userId = "alice";
    const signedIn = await callRoute();

    expect(signedOut.res.headers.get("cache-control")).toBe("no-store");
    expect(signedIn.res.headers.get("cache-control")).toBe("no-store");
  });
});
