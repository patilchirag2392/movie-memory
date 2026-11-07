"use client";

import { useActionState } from "react";

import { MOVIE_TITLE_MAX } from "@/lib/validation/movie";

import { saveFavoriteMovie, type OnboardingState } from "./actions";

// A client component only for the pending state and the inline error. The validation itself
// runs in the server action. `required` / `maxLength` here are conveniences, not security.
export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    saveFavoriteMovie,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="favoriteMovie" className="block text-sm font-medium">
        What&apos;s your favorite movie?
      </label>
      <input
        id="favoriteMovie"
        name="favoriteMovie"
        type="text"
        required
        maxLength={MOVIE_TITLE_MAX}
        autoComplete="off"
        defaultValue={state.value}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "favoriteMovie-error" : undefined}
        placeholder="e.g. Spirited Away"
        className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 aria-invalid:border-red-500 dark:border-neutral-700 dark:focus:border-neutral-100"
      />
      {state.error && (
        <p id="favoriteMovie-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
