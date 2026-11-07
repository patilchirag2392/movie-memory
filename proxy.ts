import { NextResponse, type NextRequest } from "next/server";

// Proxy (Next 16's name for middleware) runs before a route renders.
//
// Why it exists: in production, Cache Components streams pages, so a redirect() called while a
// page renders arrives as an instruction inside a 200 response, which the browser follows on
// its own. For the common case (no session cookie at all), this sends a real HTTP 307 instead,
// before any rendering happens.
//
// It is ONLY an optimistic check. It looks at whether a session cookie exists, not whether it is
// valid; it does no database lookup and is never the security boundary. Every page, Server
// Action and route handler still verifies the session itself (lib/auth/require-user.ts), so a
// forged or expired cookie gets past this file and is then rejected by the page.

// Auth.js names the cookie with a __Secure- prefix when the site is served over HTTPS.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url)); // 307 by default
}

export const config = {
  // Only the signed-in pages. The landing page, Auth.js routes and /api/fact (which answers
  // 401 itself) are deliberately not matched.
  matcher: ["/dashboard", "/onboarding"],
};
