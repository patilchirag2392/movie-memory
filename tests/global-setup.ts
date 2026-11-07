import { execSync } from "node:child_process";

/**
 * Runs once before all tests: applies the committed migrations to the test database, so the
 * tests always run against the same schema the app uses. `migrate deploy` only applies
 * migration files; it never generates new ones or resets data.
 */
export default function setup() {
  execSync("npx prisma migrate deploy", {
    // Point Prisma at the test DB. vitest.config.ts already loaded .env and checked that
    // TEST_DATABASE_URL is a separate *_test database. prisma7.config.ts's own dotenv import
    // doesn't override a variable that is already set.
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
