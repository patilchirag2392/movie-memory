import { z } from "zod";

export const MOVIE_TITLE_MAX = 100;

// Control characters (NUL, escape codes, …). Ordinary whitespace is collapsed before this check
// runs, so only "invisible junk" is left to reject. Postgres rejects NUL bytes in text columns
// outright; rejecting them here turns a 500 into a clear validation message.
const CONTROL_CHARS = /\p{Cc}/u;

/**
 * Server-side rules for a favorite-movie title. This schema is the authority: the form's
 * `required` / `maxLength` attributes are only a convenience and are trivially bypassed.
 *
 * Normalization happens first, so the length rules apply to what we actually store:
 * - NFC: visually identical titles ("é" typed two different ways) become the same string.
 * - Any run of whitespace (spaces, tabs, newlines) collapses to one space, then trim.
 *   "  The   Matrix\n" → "The Matrix", and "   " → "" (then rejected as empty).
 */
export const movieTitleSchema = z
  .string({ error: "Please enter a movie title." })
  .transform((raw) => raw.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Please enter a movie title." })
      .max(MOVIE_TITLE_MAX, {
        error: `Movie titles can be at most ${MOVIE_TITLE_MAX} characters.`,
      })
      .refine((title) => !CONTROL_CHARS.test(title), {
        error: "That title contains characters we can't save.",
      }),
  );

export type MovieTitleResult = { ok: true; title: string } | { ok: false; error: string };

/** Validate untrusted input (form field, request body). Never throws. */
export function parseMovieTitle(input: unknown): MovieTitleResult {
  const result = movieTitleSchema.safeParse(input);
  if (result.success) return { ok: true, title: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid movie title." };
}
