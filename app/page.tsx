import Link from "next/link";
import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/lib/auth/actions";
import { getSessionUserId } from "@/lib/auth/require-user";

// This page reads the session at the top level, which Cache Components only allows when the
// page opts out of the static-shell check (see the note in app/dashboard/page.tsx). A signed-in
// visitor is redirected to /dashboard. In dev that is an HTTP 307; in production it arrives as
// a redirect instruction inside the streamed response, which the browser follows.
export const instant = false;

export default async function Home() {
  if (await getSessionUserId()) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Movie Memory</h1>
          <p className="text-sm text-neutral-500">
            Save your favorite movie and get a fun fact about it.
          </p>
        </div>
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Sign in with Google
          </button>
        </form>
        <p className="text-xs text-neutral-500">
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}
