# DTS — Document Tracking System

A standalone internal document tracking system built from the official DTS field
guide. It replaces Doorify entirely: there is no Doorify code, branding, or
database in this repository.

The system covers intake, register search, workflow routing, audit history,
attachments, exports, and administration for a single agency.

## Stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Runtime  | Bun                                                          |
| API      | Hono, Zod validation, Drizzle ORM                            |
| Database | PostgreSQL (Neon in production, embedded PGlite for tests)    |
| Web      | React, Vite, Tailwind CSS, TanStack Query                    |
| Auth     | JWT access tokens + rotating refresh tokens, bcrypt hashes    |
| Files    | Vercel Blob in production, local disk in development          |
| Hosting  | Vercel (serverless API function + static web build)           |

## Repository layout

```
api/index.ts              Vercel serverless entrypoint (Request -> Response)
apps/api/                 Hono API, Drizzle schema, migrations, tests
apps/web/                 React + Vite front end (PWA)
docs/Templates/           Markdown templates for specs and daily notes
vercel.json               Build config, rewrites, cache headers
```

`api/index.ts` is the deployed function. In development the same app is served
by Bun from `apps/api/src/index.ts`; both import the same Hono instance, so the
two paths stay in step.

## Requirements

- [Bun](https://bun.sh) 1.1 or newer
- A PostgreSQL database (only for real development; tests use embedded PGlite)

## Getting started

```bash
bun install
cp apps/api/.env.example apps/api/.env   # then fill it in
bun run db:migrate
bun run seed:admin
bun run dev                             # API on :3000, web on :5173
```

`bun run dev` starts both apps. To run them separately use `bun run dev:api` and
`bun run dev:web`.

The Vite dev server proxies `/api` to the API on port 3000, so the browser only
ever talks to one origin during development.

## Environment variables

All variables are documented in `apps/api/.env.example`. The essentials:

| Variable               | Required | Purpose                                             |
| ---------------------- | -------- | --------------------------------------------------- |
| `DATABASE_URL`         | yes      | PostgreSQL connection string                        |
| `JWT_SECRET`           | yes      | Token signing secret, minimum 16 characters         |
| `APP_URL`              | yes      | Public origin, used for CORS allowlisting           |
| `BLOB_READ_WRITE_TOKEN`| production | Vercel Blob access; without it files go to disk   |
| `SENTRY_DSN`           | no       | Error reporting                                     |
| `UPSTASH_REDIS_*`      | no       | Shared rate limiting; otherwise per-instance        |

`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are read only by `seed:admin`.

Never commit a filled-in `.env`.

## Database

Schema changes live in `apps/api/migrations/` as plain SQL and are applied by a
ledger runner:

```bash
bun run db:generate   # generate SQL from the Drizzle schema
bun run db:migrate    # apply pending migrations
bun run db:studio     # browse data
```

`db:migrate` is idempotent: applied files are recorded in a ledger table and
skipped on later runs. Regenerate and review SQL by hand rather than trusting
`db:generate` for anything that could drop data.

`seed:admin` creates the first administrator and refuses weak passwords. It is a
no-op if an administrator already exists.

## Accounts and roles

There is no public sign-up. An administrator creates every account.

| Role     | Capability                                                          |
| -------- | ------------------------------------------------------------------- |
| `admin`  | Everything, including user management, reopening, archiving, settings |
| `officer`| Intake, editing own records, routing, attachments                     |
| `rd`     | Officer capabilities plus RD disposition fields                       |
| `viewer` | Read-only                                                            |

## Verification commands

```bash
bun run --cwd apps/api typecheck
bun run --cwd apps/api test        # 88 tests, embedded PGlite, no database needed
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
bun run lint
bun run format:check
```

API tests force the embedded PGlite driver, so they never touch a real database.
CI runs the same commands.

`GET /api/health` reports `200` with `"database": "connected"` only when the
database is reachable and migrated; otherwise it returns `503`. Use it to verify
a deployment rather than trusting that the function started.

## Deployment

Vercel builds the web app and deploys `api/index.ts` as a Node serverless
function. `vercel.json` rewrites every non-`/api` path to `index.html` so client
side routing works, and marks hashed assets immutable while `index.html` stays
uncached.

Before the first deployment:

1. Create a Neon database and set `DATABASE_URL`.
2. Generate a strong `JWT_SECRET` and store it in Vercel, never in the repo.
3. Set `APP_URL` to the deployed origin.
4. Set `BLOB_READ_WRITE_TOKEN`, otherwise uploaded files are written to an
   ephemeral filesystem and are lost on every cold start.
5. Run `bun run db:migrate` against the production database.
6. Run `bun run seed:admin` to create the first administrator.
7. Confirm `/api/health` reports `connected`.

Serverless filesystems are ephemeral, so `BLOB_READ_WRITE_TOKEN` is mandatory in
production even though development works from local disk.

## Not in this version

Reminders and escalations, push notifications, public tracking pages, multi
agency tenancy, bulk import, and a native mobile app are deliberately out of
scope.

## Requirements source

Field definitions, document types, and statuses come from the official DTS field
guide supplied outside this repository (`DTS_Field_Guide.md`). The guide is the
authority for what a record contains; `docs/Templates/` holds blank Markdown
templates for writing specs and notes, not the specification itself.