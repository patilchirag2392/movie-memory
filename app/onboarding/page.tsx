import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

import { OnboardingForm } from "./onboarding-form";

// Same setup as the dashboard (see the note in app/dashboard/page.tsx): who you are decides
// whether you see this page at all. proxy.ts sends visitors with no session cookie away with a
// 307; requireUser() below is the real check.
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
