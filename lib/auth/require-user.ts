import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// The ONLY source of a user id in this app. Pages, Server Actions and Route Handlers call these
// helpers; nothing reads a user id from params, query strings, form fields or request bodies.

/** The signed-in user's id, or null. For callers that handle "signed out" themselves (route handlers → 401). */
export async function getSessionUserId(): Promise<string | null> {
  // A session lookup is inherently per-request. connection() tells Cache Components so up front;
  // without it, Next sees Auth.js call crypto.getRandomValues() before any cookie read and
  // reports it as a random value leaking into a prerender.
  await connection();
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * The signed-in user's row, narrowed to what the UI needs (no lock columns, no tokens).
 * Redirects to the landing page when there is no session, or when the session points at a user
 * that no longer exists.
 *
 * Wrapped in React `cache` so several components rendering in the same request share one
 * session lookup + one DB read. The cache is per request, never shared between users.
 */
export const requireUser = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, favoriteMovie: true },
  });
  if (!user) redirect("/");

  return user;
});

export type CurrentUser = Awaited<ReturnType<typeof requireUser>>;
