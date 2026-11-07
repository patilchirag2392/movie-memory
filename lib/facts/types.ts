// The JSON contract of GET /api/fact. No server imports, so the client component can import
// these types (type-only imports are erased; no server code ships to the browser).

export type FactView = {
  content: string;
  movie: string;
  /** ISO 8601. */
  createdAt: string;
};

export type FactSuccessBody = {
  fact: FactView;
  /** Where this fact came from. Slice 6 adds "cache" and "stale". */
  source: "generated";
};

export type FactErrorCode = "unauthenticated" | "not_onboarded" | "generation_failed";

export type FactErrorBody = {
  error: { code: FactErrorCode; message: string };
};

export type FactResponseBody = FactSuccessBody | FactErrorBody;
