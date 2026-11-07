import { redirect } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { signOutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/require-user";

// Cache Components (on in next.config.ts) normally expects request-time reads like the session
// to sit inside <Suspense> so the rest of the page can prerender. Every part of this page
// depends on who is signed in, so there is no useful static shell to prerender. Blocking
// instead (instant = false) means requireUser() runs before any HTML is sent, and a signed-out
// visitor gets a real HTTP redirect, not a streamed client-side one.
export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser(); // redirects to / when signed out
  // First-time vs returning is decided here, from the DB, after every sign-in (sign-in always
  // lands on /dashboard). No favorite movie yet means not onboarded.
  if (user.favoriteMovie === null) redirect("/onboarding");

  // Google may not share a name or photo. Every display value has a fallback, so the page never
  // renders "null" or an empty heading. With no name, the email moves up to the heading (it's
  // the next most human-readable identifier), and the subtitle says the name is missing instead
  // of repeating the email.
  const name = user.name?.trim() || null;
  const displayName = name ?? user.email ?? "Movie fan";
  const subtitle = name
    ? (user.email ?? "No email shared")
    : user.email
      ? "No name shared by Google"
      : "No name or email shared by Google";
  const subtitleIsEmail = name !== null && user.email !== null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-6 p-6">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Movie Memory</span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex items-center gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <Avatar image={user.image} label={displayName} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{displayName}</h1>
          <p className={`truncate text-sm text-neutral-500 ${subtitleIsEmail ? "" : "italic"}`}>
            {subtitle}
          </p>
        </div>
      </section>

      <section className="space-y-1 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Favorite movie
        </h2>
        {/* Rendered as text: React escapes it, so a title like "<script>" is shown, not run. */}
        <p className="text-lg font-medium break-words">{user.favoriteMovie}</p>
      </section>
    </main>
  );
}
