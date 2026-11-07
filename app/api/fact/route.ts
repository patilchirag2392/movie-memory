import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/require-user";
import { getFactForUser } from "@/lib/facts/service";
import type { FactErrorBody, FactErrorCode, FactSuccessBody } from "@/lib/facts/types";

// GET /api/fact: a fun fact about the signed-in user's favorite movie.
//
// This handler takes NO user identifier: no route param, query string or body. Whatever a
// client sends (e.g. ?userId=someone-else) is ignored; the only user it can act for is the one
// whose session cookie came with the request.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return error(401, "unauthenticated", "Please sign in again.");

  const result = await getFactForUser(userId);

  if (!result.ok) {
    if (result.reason === "not_onboarded") {
      return error(409, "not_onboarded", "Pick a favorite movie first.");
    }
    // The cause is logged on the server; the client gets a friendly message, never internals.
    return error(
      503,
      "generation_failed",
      "We couldn't come up with a fun fact right now. Please try again in a moment.",
    );
  }

  return json<FactSuccessBody>(200, { fact: result.fact, source: result.source });
}

function error(status: number, code: FactErrorCode, message: string) {
  return json<FactErrorBody>(status, { error: { code, message } });
}

function json<T>(status: number, body: T) {
  // Facts are per-user and change over time: no browser or CDN may cache this response.
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
