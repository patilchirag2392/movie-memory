import "server-only";

import { db } from "@/lib/db";

// Every function takes the userId as a required argument and puts it in the WHERE (or the
// row), so no query here can read or write another user's data. Callers get the userId only
// from the session (lib/auth/require-user.ts).

export const factRepo = {
  /** The user's current favorite movie; null if not onboarded (or the user no longer exists). */
  async getFavoriteMovie(userId: string): Promise<string | null> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { favoriteMovie: true },
    });
    return user?.favoriteMovie ?? null;
  },

  /** createdAt is required and comes from the caller's clock (see the Fact model). */
  async insertFact(data: { userId: string; movie: string; content: string; createdAt: Date }) {
    return db.fact.create({
      data,
      select: { content: true, movie: true, createdAt: true },
    });
  },
};

export type FactRepo = typeof factRepo;
