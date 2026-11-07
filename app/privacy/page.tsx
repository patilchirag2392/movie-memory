import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy · Movie Memory" };

// A static page (no session reads), so it prerenders. Google requires a privacy policy URL
// before an OAuth app can be published for any Google account to sign in. Every statement here
// describes what the code actually does; keep it in sync with the schema and lib/openai.ts.

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6 text-sm leading-relaxed">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Privacy policy</h1>
        <p className="text-neutral-500">Movie Memory · last updated November 7, 2026</p>
      </div>

      <p>
        Movie Memory is a demo app built for a software engineering take-home exercise. You sign in
        with Google, tell it your favorite movie, and it shows you an AI-generated fun fact about it.
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">What we store</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>From your Google account:</strong> your name, email address, profile photo URL
            and Google account ID. The sign-in library also stores the tokens Google returns at sign-in;
            the app doesn&apos;t use them to access anything else in your Google account.
          </li>
          <li>
            <strong>What you enter:</strong> your favorite movie.
          </li>
          <li>
            <strong>What the app generates:</strong> the fun facts shown to you, with the time each was
            created.
          </li>
          <li>
            <strong>Your sign-in session:</strong> a session record. It&apos;s deleted when you sign
            out. If you don&apos;t sign out, it expires after 30 days without use (the sign-in
            library&apos;s default; using the app extends it at most once a day), and an expired
            session is rejected and deleted the next time it&apos;s presented.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">How it&apos;s used and shared</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your data is used only to sign you in and show your dashboard.</li>
          <li>
            To generate a fact, <strong>only your movie title</strong> is sent to the OpenAI API. Your
            name, email and photo are never sent to OpenAI.
          </li>
          <li>
            The app is hosted on Railway (app and database) and uses Google for sign-in and OpenAI for
            facts. Nothing is sold or shared with anyone else, and there are no ads or analytics.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Server logs</h2>
        <p>
          When something goes wrong (for example, the fact service is unavailable), the server logs
          the error. These logs may include your internal account ID, a random identifier the app
          assigns, not your email, along with technical error details. They&apos;re kept by Railway,
          the hosting provider, under its log retention, and are used only to fix problems.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Cookies</h2>
        <p>
          Only the cookies needed for sign-in: your session, plus short-lived cookies that protect the
          Google sign-in flow (CSRF and OAuth state). No tracking cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Keeping and deleting your data</h2>
        <p>
          Data is kept while this demo is running. The demo, including its database, will be deleted
          after the take-home review. To have your data deleted sooner, contact the app owner at the
          support email shown on Google&apos;s sign-in screen for Movie Memory.
        </p>
      </section>

      <p>
        <Link href="/" className="underline">
          Back to Movie Memory
        </Link>
      </p>
    </main>
  );
}
