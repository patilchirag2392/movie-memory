"use server";

import { redirect } from "next/navigation";

import { getSessionUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { parseMovieTitle } from "@/lib/validation/movie";

export type OnboardingState = { error?: string; value?: string };

export async function saveFavoriteMovie(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // Server Actions are public HTTP endpoints: anyone can POST to them, with any body. So this
  // action authenticates on its own instead of trusting that the page already checked, and the
  // user id comes from the session. The form has no user id field, and we'd ignore one if sent.
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const raw = formData.get("favoriteMovie");
  const parsed = parseMovieTitle(raw);
  if (!parsed.ok) {
    // Echo the input back so the user can fix it instead of retyping.
    return { error: parsed.error, value: typeof raw === "string" ? raw : "" };
  }

  // Onboarding is first-time only. `favoriteMovie: null` in the WHERE makes that a property of
  // the write itself, not of an earlier read: a replayed POST, or a second tab submitting
  // later, matches 0 rows and can't overwrite the saved movie.
  await db.user.updateMany({
    where: { id: userId, favoriteMovie: null },
    data: { favoriteMovie: parsed.title },
  });

  // Saved now, or already onboarded (0 rows matched): either way the dashboard is the right
  // place. If the user row vanished, the dashboard's requireUser() sends them to /.
  redirect("/dashboard");
}
