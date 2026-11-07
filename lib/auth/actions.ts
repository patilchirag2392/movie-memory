"use server";

import { signIn, signOut } from "@/auth";

// Server Actions so the buttons are plain <form>s: they work before JS loads, and Auth.js
// handles the CSRF check and the OAuth redirect on the server.

export async function signInWithGoogle() {
  // Always land on /dashboard. The dashboard decides first-time (→ /onboarding) vs returning
  // from the DB, so that rule lives in one place instead of inside the OAuth callback.
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  // Deletes the Session row (database strategy) and clears the cookie.
  await signOut({ redirectTo: "/" });
}
