import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createUser, db, resetDatabase } from "../helpers/db";

// Spec: "Ensure users cannot access or modify other users' data". The fact tests cover reads;
// these cover the one place a user writes their own profile: the onboarding Server Action.
// Server Actions are public HTTP endpoints, so each test acts like an attacker would: posting
// any form fields it likes, with or without a session.

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {}, // only meaningful inside a Next.js render
}));

// Like Next's real redirect(), this throws, so code after a redirect never runs.
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));

const { saveFavoriteMovie } = await import("@/app/onboarding/actions");

/** Submit the action with arbitrary form fields; report where it redirected or what it returned. */
async function submit(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  try {
    return { state: await saveFavoriteMovie({}, form) };
  } catch (error) {
    if (error instanceof Redirect) return { redirectedTo: error.to };
    throw error;
  }
}

const movieOf = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id } })).favoriteMovie;

beforeEach(async () => {
  await resetDatabase();
  session.userId = null;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("onboarding Server Action authorization", () => {
  it("without a session, redirects to / and writes nothing", async () => {
    await createUser("bob", null);

    const result = await submit({ favoriteMovie: "Heat", userId: "bob" });

    expect(result).toEqual({ redirectedTo: "/" });
    expect(await movieOf("bob")).toBeNull();
  });

  it("saves for the session user only, ignoring a userId field in the form", async () => {
    await createUser("alice", null);
    await createUser("bob", null); // also not onboarded: a missing user filter would hit him too
    session.userId = "alice";

    const result = await submit({ favoriteMovie: "  Spirited   Away ", userId: "bob" });

    expect(result).toEqual({ redirectedTo: "/dashboard" });
    expect(await movieOf("alice")).toBe("Spirited Away"); // stored, normalized
    expect(await movieOf("bob")).toBeNull(); // untouched
  });

  it("never overwrites a movie that is already saved (first-time only)", async () => {
    await createUser("alice", "The Matrix");
    session.userId = "alice";

    const result = await submit({ favoriteMovie: "Overwrite Attempt" });

    expect(result).toEqual({ redirectedTo: "/dashboard" });
    expect(await movieOf("alice")).toBe("The Matrix");
  });

  it("rejects invalid input on the server and writes nothing", async () => {
    await createUser("alice", null);
    session.userId = "alice";

    const blank = await submit({ favoriteMovie: "     " });
    const tooLong = await submit({ favoriteMovie: "x".repeat(101) });

    expect(blank).toMatchObject({ state: { error: expect.any(String) } });
    expect(tooLong).toMatchObject({ state: { error: expect.any(String) } });
    expect(await movieOf("alice")).toBeNull();
  });
});
