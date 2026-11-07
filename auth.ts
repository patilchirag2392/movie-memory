import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { db } from "@/lib/db";

// Auth.js reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Database sessions (not JWT): the cookie holds only an opaque session token, and every
  // auth() call looks it up in the Session table. Signing out deletes the row, so a session can
  // be revoked server-side, and the user id we authorize with always comes from our own DB.
  session: { strategy: "database" },
  providers: [Google],
  callbacks: {
    // With database sessions, `user` is the row the adapter loaded for this session token.
    // Auth.js doesn't put the id on session.user by default; we need it to scope every query.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
