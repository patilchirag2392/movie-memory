import "server-only";

import { FactGenerationError, generateMovieFact } from "@/lib/openai";

import { factRepo, type FactRepo } from "./repo";
import type { FactView } from "./types";

/**
 * Everything the service touches outside its own logic, passed in so tests can substitute
 * each piece: a repo against the test DB, a `generate` that fails or counts calls, and a
 * fixed `now`.
 */
export type FactDeps = {
  repo: FactRepo;
  generate: (movie: string) => Promise<string>;
  /** The ONE clock for every timestamp the fact logic writes or compares. */
  now: () => Date;
};

const defaultDeps: FactDeps = {
  repo: factRepo,
  generate: generateMovieFact,
  now: () => new Date(),
};

export type FactResult =
  | { ok: true; fact: FactView; source: "generated" }
  | { ok: false; reason: "not_onboarded" | "generation_failed" };

/**
 * Base version (slice 5): generate a new fact on every call and store it.
 * Slice 6 adds the 60-second cache, the generation lease, and the stale-fact fallback here.
 *
 * `userId` must come from the session. This function trusts it, which is why nothing outside
 * the server (no param, no body field) can supply it.
 */
export async function getFactForUser(
  userId: string,
  deps: FactDeps = defaultDeps,
): Promise<FactResult> {
  const movie = await deps.repo.getFavoriteMovie(userId);
  if (movie === null) return { ok: false, reason: "not_onboarded" };

  let content: string;
  try {
    content = await deps.generate(movie);
  } catch (error) {
    if (!(error instanceof FactGenerationError)) throw error; // a bug, not an OpenAI failure
    console.error("[facts] generation failed", { userId, cause: describe(error.cause ?? error) });
    return { ok: false, reason: "generation_failed" };
  }

  const fact = await deps.repo.insertFact({ userId, movie, content, createdAt: deps.now() });
  return { ok: true, fact: toView(fact), source: "generated" };
}

function toView(fact: { content: string; movie: string; createdAt: Date }): FactView {
  return { content: fact.content, movie: fact.movie, createdAt: fact.createdAt.toISOString() };
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
