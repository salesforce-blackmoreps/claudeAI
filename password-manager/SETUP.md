# Local Setup

Get this project running on your own machine. This covers the backend API
and the Chrome extension; see `docs/crypto-architecture.md` for how they fit
together and `docs/chrome-web-store-listing.md` /
`docs/permissions-justification.md` / `docs/privacy-policy.md` for
publishing-related steps.

## Prerequisites

- **Node.js 22** (this project was built and tested on Node 22.x — earlier
  versions aren't verified)
- **npm** (ships with Node)
- **Docker** (for local Postgres + Redis), or your own Postgres 16 and Redis 7
  instances if you'd rather not use Docker
- **Google Chrome** (or another Chromium-based browser) to load the unpacked
  extension

## 1. Clone and install

```bash
git clone https://github.com/salesforce-blackmoreps/claudeai.git
cd claudeai/password-manager
npm install
```

This is an npm-workspaces monorepo (`extension`, `backend`, `shared` — see
`package.json`), so one `npm install` at the `password-manager/` root wires up
all three.

## 2. Start Postgres and Redis

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts Postgres 16 on `localhost:5432` (db `password_manager`, user/pass
`postgres`/`postgres`) and Redis 7 on `localhost:6379`, matching the defaults
in the env file below. If you already have your own Postgres/Redis running
elsewhere, skip this and point the env vars at those instead.

## 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Then edit `.env`:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Leave as-is if using the Docker Compose setup above |
| `REDIS_URL` | Leave as-is if using the Docker Compose setup above |
| `JWT_ACCESS_SECRET` | Any random string for local dev |
| `SERVER_SECRET_KEY` | 32 random bytes, base64-encoded — generate with `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TEAM_*` | Test-mode values from your own Stripe dashboard if you want billing to work; otherwise leave the placeholder values — everything except `/billing/*` routes works fine without real Stripe keys |
| `BILLING_*_URL` | Leave as-is for local dev; these only matter once Stripe redirects are actually exercised |
| `PORT` | `3000` (the extension's default `API_BASE_URL` expects this) |

## 4. Run the database migrations

```bash
npx prisma migrate deploy
```

(Still inside `password-manager/backend`.) This applies every migration in
`prisma/migrations/` to the database from step 2.

## 5. Start the backend

```bash
npm run dev
```

This runs `ts-node-dev --respawn --transpile-only src/main.ts`, which
restarts automatically on file changes. Confirm it's up:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## 6. Build and load the extension

```bash
cd ../extension
npm run build
```

Output goes to `password-manager/extension/dist`. Then in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `password-manager/extension/dist`

The extension's popup should now open and show the signup screen. It talks to
`http://localhost:3000` by default (`extension/src/lib/config.ts`); if your
backend runs somewhere else, set `VITE_API_BASE_URL` before building:

```bash
VITE_API_BASE_URL=http://localhost:4000 npm run build
```

For active extension development, `npm run dev` (Vite dev server) gives you
hot-reload instead of a full rebuild per change — load the same `dist`
folder once and Vite will keep it updated.

## 7. Verify everything works

- **Backend tests**: from `password-manager/backend`, run `npm test` (Jest;
  should show all suites passing)
- **Extension tests**: from `password-manager/extension`, run `npm test`
  (Vitest)
- **Typecheck + lint everywhere**: from `password-manager/`, run
  `npm run typecheck` and `npm run lint` (runs across all three workspaces)
- **End-to-end**: sign up in the extension popup, add a vault item, confirm
  it appears in `GET http://localhost:3000/vault/sync` with your access
  token, try autofill on any real login page, and try creating a passkey on
  a WebAuthn test site (e.g. https://webauthn.io)

## Common issues

- **`ECONNREFUSED` on backend startup** — Postgres/Redis aren't running or
  the ports don't match `.env`. Check `docker compose ps`.
- **Prisma errors about missing tables** — you skipped step 4, or ran it
  against the wrong `DATABASE_URL`.
- **Extension popup stuck on "Loading…"** — check the service worker's
  console (`chrome://extensions` → the extension → "service worker" link)
  for errors; usually means the backend isn't reachable at the configured
  `API_BASE_URL`.
- **Signup returns 429** — `/auth/signup` is rate-limited to 5/minute per IP
  (`@Throttle` in `auth.controller.ts`); wait a minute if you're testing
  repeated signups.

## What's not covered here

Deploying to a real server, configuring live Stripe billing, and Chrome Web
Store submission are separate, account-gated steps — see
`docs/chrome-web-store-listing.md` for the Web Store checklist. This document
is just for running the project locally.
