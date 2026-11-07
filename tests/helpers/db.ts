import { db } from "@/lib/db";

export { db };

/** Empty every table (children first). Only ever runs against the test DB (see vitest.config.ts). */
export async function resetDatabase() {
  await db.fact.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();
}

export async function createUser(id: string, favoriteMovie: string | null) {
  return db.user.create({ data: { id, name: `User ${id}`, email: `${id}@example.test`, favoriteMovie } });
}

export async function createFact(userId: string, movie: string, content: string, createdAt: Date) {
  return db.fact.create({ data: { userId, movie, content, createdAt } });
}

export async function factCount(userId: string) {
  return db.fact.count({ where: { userId } });
}
