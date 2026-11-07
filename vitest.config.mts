import path from "node:path";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

loadDotenv({ quiet: true });

// Integration tests wipe tables. They may only ever run against the dedicated test database,
// never the dev database, so refuse to start unless that is unambiguous.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: tests delete data");
}
if (!new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must point at a database whose name ends in _test");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // `server-only` is a build-time guard for Next's client bundles: importing it from
      // client code fails the build. Tests run in plain Node (server side by definition),
      // where the package would throw on import, so it resolves to an empty module here.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // lib/db.ts reads DATABASE_URL, so every test talks to the test database.
    env: { DATABASE_URL: testDatabaseUrl },
    globalSetup: ["tests/global-setup.ts"],
    // Integration test files share one database; run files one at a time so one file's
    // cleanup can't delete another's rows mid-test.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
