# Movie Memory

Sign in with Google, save your favorite movie, and get an AI-generated fun fact about it.

Built for a full-stack take-home exercise, with **Variant A: backend caching and correctness**.

**Live demo:** https://web-production-c2ef87.up.railway.app (see [Live demo](#live-demo) for who can sign in).

**Stack:** Next.js 16 (App Router, TypeScript) · React 19 · Tailwind CSS 4 · Prisma 7 · Postgres 17 · Auth.js v5 (Google) · OpenAI · zod · Vitest

---

## Contents
1. [Live demo](#live-demo)
2. [Setup](#setup)
3. [Environment variables](#environment-variables)
4. [Database and migrations](#database-and-migrations)
5. [Accessing the database](#accessing-the-database)
6. [Tests](#tests)
7. [Variant choice](#variant-choice)
8. [Architecture overview](#architecture-overview)
9. [Key tradeoffs](#key-tradeoffs)
10. [With two more hours](#with-two-more-hours)
11. [AI usage](#ai-usage)

---

## Live demo

**https://web-production-c2ef87.up.railway.app**, hosted on [Railway](https://railway.com): the app plus a Railway Postgres database.

- **Who can sign in:** the Google consent screen is in Testing mode, so only Google accounts listed as test users can sign in. Others see Google's "access blocked" page.
- **The first visit after a quiet period takes a few extra seconds:** Railway's free plan puts the app to sleep when idle.
- **How it's deployed:**
  - The service builds with Railway's default builder and starts with `npm start` on Node 22 (from `engines` in `package.json`).
  - Before each deploy, Railway runs `npm run db:deploy` (its pre-deploy command), so migrations are applied inside Railway's private network.
  - A healthcheck on `/` must pass before traffic switches to a new deploy.
- **Railway settings:** these live in the service settings, not in the repo. Railway has deprecated `railway.json` config files for new services.
- **Environment variables:** the same as below, plus `AUTH_URL` set to the public URL (see [Production mode](#production-mode)). The demo uses its own `AUTH_SECRET`, and `DATABASE_URL` points at Railway's private database host.

---

## Setup

**Prerequisites:** Node 22+, Docker, a Google OAuth client, and an OpenAI API key with credit on the account.

```bash
git clone https://github.com/patilchirag2392/movie-memory.git
cd movie-memory
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill it in (next section)
npm run db:up               # Postgres 17 in Docker on port 5433 (dev + test databases)
npm run db:deploy           # apply the committed migrations
npm run dev                 # http://localhost:3000
```

### Google OAuth client
1. In [Google Cloud Console](https://console.cloud.google.com), create a project and configure the **OAuth consent screen**: External audience, and add your Google account under **Test users** (while the app is in Testing mode, only test users can sign in).
2. Create an **OAuth client** of type **Web application** with:
   - Authorized JavaScript origin: `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Copy the client ID and secret into `.env`.

### Production mode
`npm run build && npm start` also needs `AUTH_TRUST_HOST=true`. Without it, Auth.js rejects requests with `UntrustedHost`; `npm run dev` trusts localhost automatically.

Behind a hosting proxy (such as Railway), also set `AUTH_URL` to the public URL. Without it, Auth.js built the Google callback URL from the container's internal address (`https://localhost:8080`), and Google sign-in fails.

---

## Environment variables

All of them are server-only: none uses the `NEXT_PUBLIC_` prefix, so Next.js never puts them in browser JavaScript.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Dev database. The example value matches `docker-compose.yml`. |
| `TEST_DATABASE_URL` | for tests | A separate database whose name ends in `_test`. Tests refuse to run otherwise. |
| `AUTH_SECRET` | yes | Signs and encrypts Auth.js cookies. Generate with `openssl rand -base64 32`. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | yes | The Google OAuth client from Setup. |
| `OPENAI_API_KEY` | yes | Used only by `lib/openai.ts`, on the server. |
| `OPENAI_MODEL` | no | Defaults to `gpt-4.1-mini`. |
| `AUTH_TRUST_HOST` | production mode only | See [Production mode](#production-mode). |
| `AUTH_URL` | when hosted behind a proxy | The public URL, e.g. the Railway domain. See [Production mode](#production-mode). |

---

## Database and migrations

| Command | What it does |
|---|---|
| `npm run db:up` | Starts Postgres (`docker compose up -d --wait`). On first start it also creates `movie_memory_test`. |
| `npm run db:deploy` | `prisma migrate deploy`: applies committed migrations only. Use this on a fresh clone. |
| `npm run db:migrate` | `prisma migrate dev`: for schema changes during development; creates a new migration. |
| `npm run db:studio` | Opens Prisma Studio to browse the data. |

The Postgres container listens on port **5433**, not 5432, so it doesn't collide with a Postgres already running on the host. Prisma 7 reads its connection URL from `prisma7.config.ts` (that version's default config name), not from the schema file.

---

## Accessing the database

The container must be running (`npm run db:up`). Connection details come from your `.env` (`DATABASE_URL` for dev, `TEST_DATABASE_URL` for tests); none are repeated here.

**Prisma Studio (dev database).** It uses `DATABASE_URL` and opens at http://localhost:5555.
```bash
npm run db:studio
```

**psql inside the Postgres container.** No password is needed: the container accepts local connections. The user name is `POSTGRES_USER` from `docker-compose.yml`.
```bash
docker compose exec db psql -U movie -d movie_memory        # dev database
```
```bash
docker compose exec db psql -U movie -d movie_memory_test   # test database
```
Use `\dt` to list tables and `\q` to quit. Remember that `npm test` empties the test database on every run.

**GUI client (TablePlus, DBeaver, Postico, …).**

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5433` |
| User, password, database | the parts of `DATABASE_URL` (or `TEST_DATABASE_URL`) in `.env`, which has the form `postgresql://USER:PASSWORD@localhost:5433/DATABASE` |
| SSL | off (local only) |

TablePlus can also create the connection directly from the URL: when adding a connection, choose **Import from URL** and paste the value of `DATABASE_URL`.

---

## Tests

```bash
npm run db:up   # the tests use the Docker test database
npm test        # 37 tests, about 2.5s
```

Tests run against a **real Postgres** test database. Burst protection depends on Postgres row locking, which a mocked Prisma can't show. Only OpenAI (a fake `generate`) and time (an injected clock) are faked. Migrations are applied automatically before the tests run.

| File | Covers |
|---|---|
| `tests/unit/cache.test.ts` | The 60s rule to the millisecond: 59.999s is cached, exactly 60s regenerates. |
| `tests/integration/fact-service.test.ts` | Cache window end to end. Facts are scoped to the current movie. OpenAI failure: stale fact, or a friendly error, never a previous movie's fact; the lease is released. **5 concurrent requests → 1 OpenAI call and 1 stored fact.** Waiting requests don't retry against a failing API. Per-user isolation. |
| `tests/integration/fact-route.test.ts` | Authorization on the real `GET /api/fact` handler: 401 without a session, `?userId=other` ignored, 409 based on the *session* user, `Cache-Control: no-store`. |
| `tests/integration/onboarding-action.test.ts` | Users can't *modify* other users' data: the onboarding Server Action with no session redirects and writes nothing; a `userId` field in the form is ignored, so only the session user's row changes; a saved movie is never overwritten; invalid input is rejected without writing. |
| `tests/unit/movie-validation.test.ts` | Onboarding input rules. |
| `tests/unit/proxy.test.ts` | `proxy.ts` sends a real 307 to `/` from `/dashboard` and `/onboarding` when there's no session cookie, ignores unrelated cookies, and lets either Auth.js cookie name through for the page to verify. |

To confirm the tests actually catch bugs, I injected seven bugs one at a time:
- an off-by-one in the 60s check;
- no lease;
- no movie filter on fact queries;
- no user filter on fact queries;
- no user filter on the onboarding write;
- trusting a `userId` sent in the form;
- allowing an existing movie to be overwritten.

Each one made exactly the tests for that rule fail.

---

## Variant choice

I chose Variant A because its problems are ones I've worked on before. In Converge, my real-time collaborative editor, the hard part was keeping shared state correct when several clients act at once, which is the same shape as two tabs racing to generate a fact. In Sentiment Aura, I built a real-time pipeline on external APIs (Deepgram and the Claude API), so I treated the OpenAI timeout and fallback as a core part of the problem rather than an edge case. Variant A let me turn that experience into a design I could test: a lease that lets exactly one request generate, a cache window with an exact boundary, and a fallback that never serves the wrong movie's fact.

---

## Architecture overview

### Request flow
```
Browser ──► Next.js App Router (Node.js)
             ├─ proxy.ts           /dashboard, /onboarding: no session cookie → 307 /
             ├─ /                  landing page; signed in → /dashboard
             ├─ /onboarding        first-time only; Server Action saves the movie
             ├─ /dashboard         profile + movie (server-rendered) + <FactCard/> (client)
             ├─ /api/auth/*        Auth.js (Google OAuth, database sessions)
             └─ /api/fact          GET → lib/facts/service.ts ──► Postgres (Prisma)
                                                           └──► OpenAI (server-only)
```

### Authentication and authorization
- **Auth.js with the Prisma adapter and database sessions.** The cookie holds only a random session token, and every request looks it up in the `Session` table. Signing out deletes the row, so sessions can be revoked on the server.
- **`lib/auth/require-user.ts` is the only source of a user id.** Pages call `requireUser()`, which redirects when signed out. The API route and server actions call `getSessionUserId()`. No route param, query string, form field or request body is ever read as a user id. `GET /api/fact` doesn't even accept the request object.
- **Access checks happen next to the data.** Every page, server action and route handler checks the session itself. Server actions are public HTTP endpoints, so the onboarding action re-checks the session instead of trusting the page.
- **`proxy.ts` is only an optimistic check.** For `/dashboard` and `/onboarding`, if there's no session cookie at all, it answers with a real HTTP 307 to `/` before the page runs. It never validates the cookie or touches the database, so it isn't a security boundary: a forged or expired cookie gets past it and is rejected by the page.
- **First-time vs returning:** sign-in always lands on `/dashboard`, which sends users with no `favoriteMovie` to `/onboarding`. That's one rule, read from the database.
- **Pages read the session at the top level (`export const instant = false`).** This Next version enables Cache Components, which expects request-time reads to sit behind `<Suspense>`. These pages depend entirely on who is signed in, so there's no useful static part to show first, and `instant = false` opts them out of that check. `await connection()` marks the session read as request-time work.
- **How redirects arrive.** In dev, a page's `redirect()` is an HTTP 307. In production, Cache Components streams pages, so a redirect from inside a page arrives as an instruction in a 200 response, which the browser follows. That's why `proxy.ts` handles the common no-cookie case with a real 307. The page-level redirects (an invalid cookie; first-time vs returning) stay streamed. No protected content is rendered in either case; I checked the production response for `/dashboard` with a forged cookie.

### Data model (`prisma/schema.prisma`)
- **`User.favoriteMovie String?`:** `NULL` means not onboarded yet. The spec allows one favorite per user, so a separate movie table would add a join for no benefit, and a separate `onboarded` flag could disagree with the data.
- **`Fact { userId, movie, content, createdAt }`**, indexed on `(userId, movie, createdAt DESC)`:
  - `movie` is a copy of the title at the time the fact was made, so lookups filter on the user's *current* title and a fact about an earlier movie can never be served.
  - `createdAt` has **no database default**. The app sets it from one injected clock, and Prisma's types make it a required field.
  - The index matches the one hot query exactly ("newest fact for this user and movie").
- **`User.factLockToken` / `factLockUntil`:** the generation lease (below).
- Auth.js `Account` and `Session` tables. `VerificationToken` and `Authenticator` are left out because email and passkey sign-in aren't used.
- All timestamps are `timestamptz`, and every foreign key deletes in cascade with its user.

### Fact generation (`lib/facts/`)
```mermaid
flowchart TD
  A[GET /api/fact] --> B{session?}
  B -- no --> E401[401]
  B -- yes --> C{favoriteMovie?}
  C -- no --> E409[409 not_onboarded]
  C -- yes --> D{fact for user + movie<br/>younger than 60s?}
  D -- yes --> CACHE[200 source: cache]
  D -- no --> L{acquire lease<br/>one atomic UPDATE}
  L -- won --> R{re-check cache}
  R -- fresh --> CACHE
  R -- stale --> G[OpenAI, 10s deadline]
  G -- ok --> S[insert fact, release lease] --> GEN[200 source: generated]
  G -- fails --> F{latest fact for<br/>user + CURRENT movie?}
  L -- lost --> W[poll every 500ms, max 12s]
  W -- winner's fact appears --> CACHE
  W -- lease freed, no fact --> F
  F -- yes --> STALE[200 source: stale]
  F -- no --> E503[503 friendly message]
```

- **60-second cache:** `isFresh(createdAt, now)` is a pure function: `now - createdAt < 60s`.
- **Burst protection (generation lease):**
  - A request takes the lease with one statement: `UPDATE "User" SET token, until WHERE id = $1 AND (factLockUntil IS NULL OR factLockUntil < now)`. I confirmed with query logging that Prisma's `updateMany` sends exactly this. Postgres locks the row for the first such update; the others re-check the condition against the updated row and match nothing. Exactly one request wins, across any number of server instances, with **no transaction held open during the OpenAI call**.
  - The winner re-checks the cache, generates, stores the fact, and releases the lease in a `finally`. The release only succeeds if the stored token still matches, so a request whose lease expired can't clear a newer holder's lease.
  - Losers poll for the winner's fact. They read the lease *before* looking for the fact: the winner stores before releasing, so a free lease plus no fact really means the winner failed, and the loser falls back immediately instead of calling a failing API again.
- **Timing rule:** OpenAI deadline 10s < loser max wait 12s < lease lifetime 20s, checked when the module loads (`lib/facts/timing.ts`). The OpenAI client uses `maxRetries: 0` and a single `AbortSignal.timeout(10s)`. The SDK's own timeout applies to each retry attempt, so retries could have pushed a request past the lease's lifetime, letting a second request start a duplicate generation.
- **Failure handling:** if OpenAI fails, the response is the latest fact for **this user and their current movie**, marked `stale`. Otherwise it's a 503 with a friendly message. The real cause is logged on the server only.
- **Safe OpenAI use:**
  - `lib/openai.ts` imports `server-only`, so importing it from browser code fails the build.
  - The title is sent as the user message, and the instructions say to treat it purely as a title and not to invent facts.
  - The output is capped, and empty or overlong replies count as failures.
  - Facts are rendered as plain text, which React escapes.
- **Testability:** the service takes its repository, `generate` function, clock and `sleep` as parameters.

### Frontend
- The dashboard is server-rendered; the fact card (`components/fact-card.tsx`) loads `/api/fact` after render, so a slow OpenAI call never delays the page.
- The card ignores responses from requests it has replaced, so an older, slower response can't overwrite a newer one. It explains cached and stale facts to the user.
- `components/avatar.tsx` shows initials when the Google photo is missing or fails to load. The name and email have fallbacks too ("No name shared by Google").

### File map
| Path | Role |
|---|---|
| `auth.ts`, `app/api/auth/[...nextauth]/route.ts` | Auth.js setup |
| `proxy.ts` | optimistic no-cookie → 307 for the signed-in pages |
| `lib/auth/require-user.ts`, `lib/auth/actions.ts` | session → user id; sign-in/out actions |
| `app/onboarding/*`, `lib/validation/movie.ts` | onboarding page, action, validation rules |
| `app/dashboard/page.tsx`, `components/*` | dashboard, avatar, fact card |
| `app/privacy/page.tsx` | privacy policy (Google requires one before the OAuth app can be published for any Google account) |
| `app/api/fact/route.ts` | HTTP contract: 200/401/409/503, `no-store` |
| `lib/facts/service.ts` | cache → lease → generate → fallback |
| `lib/facts/repo.ts` | every fact query, all filtered by `userId` |
| `lib/facts/cache.ts`, `lib/facts/timing.ts` | 60s rule; timing constants and their ordering check |
| `lib/openai.ts` | the only file that calls OpenAI (server-only) |
| `lib/db.ts`, `prisma/` | Prisma client, schema, migrations |

---

## Key tradeoffs

- **A lease row instead of the spec's other options.**
  - A unique constraint per 60-second time bucket only stops duplicate *rows*: every losing request has already paid for an OpenAI call. Fixed buckets also don't match a sliding "less than 60 seconds old" window.
  - Holding a database transaction or advisory lock during a 10-second network call ties up a pooled connection, and Prisma's interactive transactions time out at 5s by default.
  - An in-memory lock doesn't work across server instances.
  - The lease costs a few more moving parts in exchange.
- **Lease columns on `User` instead of a separate lock table.** Each user already has exactly one row, so taking the lease is a single `updateMany` with no raw SQL and no race to create the lock row. The cost is that a concurrency mechanism sits next to profile data.
- **One app clock.** Every timestamp the logic compares comes from the app server's clock, which makes the 60s boundary exact and testable. It assumes app servers have synchronized clocks (NTP). The alternative is using Postgres `now()` as the single clock via raw SQL, at the cost of an injectable clock in tests.
- **Losers poll instead of being notified.** A waiting request makes up to two small queries every 500ms for at most 12s. Postgres `LISTEN/NOTIFY` would avoid polling, but adds connection management that isn't worth it at this scale.
- **Crash recovery is bounded but not instant.** If a request dies while holding the lease, that user gets the fallback (stale fact or friendly error) for up to 20s, until the lease expires. Letting waiting requests take over would risk duplicate generations and repeated retries against a failing API.
- **No automatic retries against OpenAI.** A failed call becomes a stale fact or an error right away, keeping total time bounded so the lease stays correct. The user can click "Get another".
- **`GET` creates data.** `GET /api/fact` can create a fact, but within the 60s window it's effectively idempotent, and the spec names the endpoint this way. Every response has `Cache-Control: no-store`.
- **Top-level session reads instead of Suspense boundaries.** Simpler pages, at the cost of the instant static shell that Cache Components could provide. In production, redirects issued by the pages themselves arrive inside the streamed response rather than as HTTP 307s. `proxy.ts` covers the common signed-out case with a real 307, using a cookie-presence check only.
- **Auth.js v5 is still a beta** (pinned to `5.0.0-beta.32`), and the project is now in maintenance mode, since its team joined Better Auth. It was the required stack.
- **The adapter stores Google's access and ID tokens** in `Account` even though the app never uses them.
- **Facts are kept as an append-only history.** That satisfies "store generated facts" but grows without bound.

---

## With two more hours

1. **More varied facts:** send the user's last few facts with the prompt and ask for something different. Today the model often repeats the same well-known fact.
2. **Edit the movie from the dashboard.** The data model already handles it: facts are filtered by the current movie, so old facts automatically stop being served.
3. **Playwright end-to-end tests** for the sign-in → onboarding → dashboard flow, plus **CI** (GitHub Actions with a Postgres service running `npm test`).
4. **Clear the unused Google tokens** from `Account` after sign-in.
5. **A per-user daily cap on OpenAI calls** to bound cost, plus structured logging and metrics for cache hit rate, lease contention and OpenAI latency/errors.
6. **Automatic deploys from GitHub** for the Railway demo (it's currently deployed from the CLI), plus a staging environment.
7. **Prune old facts**, keeping the last N per user.

---

## AI usage

- I used Claude Code for implementation and a separate Claude chat for design review and README editing.
- I set the constraints before any code: design first, small slices reviewed one at a time, no in-memory locks, OpenAI calls on the server only, and user ids taken only from the session.
- Claude Code proposed the schema and burst-protection design. I had it reviewed independently in the separate chat, which flagged five issues: SDK retries outliving the lease, mixed clocks, a fallback that could serve an old movie's fact, untested failure paths, and Prisma config drift. I sent those back as corrections before implementation started.
- I reviewed every slice's diff before committing and required an explanation for each change.
- Each slice was verified before I accepted it: build and lint, live checks against the running app, a dead OpenAI host to test the timeout and fallback, query logging to confirm the lease is a single SQL statement, and deliberately injected bugs to confirm the tests catch them.
- I handled the Google OAuth setup, the real sign-in round trip, and the OpenAI account setup.
