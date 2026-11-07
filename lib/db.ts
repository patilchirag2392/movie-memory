import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 talks to Postgres through a driver adapter (node-postgres here), not a bundled engine.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process. In dev, Next.js hot reload re-evaluates modules; without caching the
// client on globalThis, each reload would open a new connection pool and eventually exhaust
// Postgres connections. In production the module is evaluated once, so this is a no-op there.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
