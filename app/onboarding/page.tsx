import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

import { OnboardingForm } from "./onboarding-form";

// Blocking for the same reason as the dashboard: who you are decides whether you see this page
// at all, so the redirect must happen before any HTML is sent.
export const instant = false;

export default async function OnboardingPage() {
  const user = await requireUser(); // signed out → /
  if (user.favoriteMovie !== null) redirect("/dashboard"); // first-time only

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-sm text-neutral-500">One question before we start.</p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
