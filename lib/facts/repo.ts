import "server-only";

import { db } from "@/lib/db";

// Every function takes the userId as a required argument and puts it in the WHERE (or the
// row), so no query here can read or write another user's data. Callers get the userId only
// from the session (lib/auth/require-user.ts).

const factSelect = { content: true, movie: true, createdAt: true } as const;

export type StoredFact = { content: string; movie: string; createdAt: Date };

export const factRepo = {
  /** The user's current favorite movie; null if not onboarded (or the user no longer exists). */
  async getFavoriteMovie(userId: string): Promise<string | null> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { favoriteMovie: true },
    });
    return user?.favoriteMovie ?? null;
  },

  /**
   * Newest fact for this user AND this movie: the cache lookup and the stale fallback both use
   * it. Filtering on the movie means a fact about a previous movie is never returned.
   * Uses the (userId, movie, createdAt DESC) index.
   */
  async findLatestFact(userId: string, movie: string): Promise<StoredFact | null> {
    return db.fact.findFirst({
      where: { userId, movie },
      orderBy: { createdAt: "desc" },
      select: factSelect,
    });
  },

  /** Newest fact for user + movie created at or after `since`, i.e. one another request just made. */
  async findFactCreatedSince(userId: string, movie: string, since: Date): Promise<StoredFact | null> {
    return db.fact.findFirst({
      where: { userId, movie, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: factSelect,
    });
  },

  /** createdAt is required and comes from the caller's clock (see the Fact model). */
  async insertFact(data: {
    userId: string;
    movie: string;
    content: string;
    createdAt: Date;
  }): Promise<StoredFact> {
    return db.fact.create({ data, select: factSelect });
  },

  /**
   * Try to take the generation lease. True means this request owns it until `until`.
   *
   * Prisma sends this as ONE statement (checked with query logging):
   *   UPDATE "User" SET token, until WHERE id = $1 AND (lockUntil IS NULL OR lockUntil < $now)
   * When requests race, Postgres locks the row for the first UPDATE. The others wait, then
   * re-check their WHERE against the updated row, see an unexpired lease, and match 0 rows. So
   * exactly one wins, and no transaction is held open across the OpenAI call.
   */
  async acquireLease(userId: string, token: string, now: Date, until: Date): Promise<boolean> {
    const { count } = await db.user.updateMany({
      where: { id: userId, OR: [{ factLockUntil: null }, { factLockUntil: { lt: now } }] },
      data: { factLockToken: token, factLockUntil: until },
    });
    return count === 1;
  },

  /**
   * Release the lease, but only if we still hold it. The token check ("fencing") means a
   * request whose lease already expired can't clear the lease of a newer holder.
   */
  async releaseLease(userId: string, token: string): Promise<void> {
    await db.user.updateMany({
      where: { id: userId, factLockToken: token },
      data: { factLockToken: null, factLockUntil: null },
    });
  },

  /** Whether some request currently holds an unexpired lease for this user. */
  async isLeaseHeld(userId: string, now: Date): Promise<boolean> {
    const count = await db.user.count({ where: { id: userId, factLockUntil: { gt: now } } });
    return count === 1;
  },
};

export type FactRepo = typeof factRepo;
