import { signOutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/require-user";

// Cache Components (on in next.config.ts) normally expects request-time reads like the session
// to sit inside <Suspense> so the rest of the page can prerender. Every part of this page
// depends on who is signed in, so there is no useful static shell to prerender. Blocking
// instead (instant = false) means requireUser() runs before any HTML is sent, and a signed-out
// visitor gets a real HTTP redirect, not a streamed client-side one.
export const instant = false;

// Slice 2 stub: proves the auth gate works. Slice 4 fills in the full dashboard.
export default async function DashboardPage() {
  const user = await requireUser(); // redirects to / when signed out

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-neutral-500">Signed in as {user.name ?? user.email ?? "you"}.</p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
