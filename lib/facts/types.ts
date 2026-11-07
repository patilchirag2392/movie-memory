// The JSON contract of GET /api/fact. No server imports, so the client component can import
// these types (type-only imports are erased; no server code ships to the browser).

export type FactView = {
  content: string;
  movie: string;
  /** ISO 8601. */
  createdAt: string;
};

/**
 * - "generated": this request created the fact.
 * - "cache": the fact is less than 60s old, or another concurrent request just created it.
 * - "stale": OpenAI failed, so this is the user's most recent fact for this movie (any age).
 */
export type FactSource = "generated" | "cache" | "stale";

export type FactSuccessBody = {
  fact: FactView;
  source: FactSource;
};

export type FactErrorCode = "unauthenticated" | "not_onboarded" | "generation_failed";

export type FactErrorBody = {
  error: { code: FactErrorCode; message: string };
};

export type FactResponseBody = FactSuccessBody | FactErrorBody;
