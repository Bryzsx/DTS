# AGENTS.md

Working notes for coding agents on this repository. See `README.md` for setup
and deployment.

## Non-negotiables

- **Doorify is gone.** Do not reintroduce Doorify names, branding, routes, or
  schema. If a file mentions Doorify, that is a bug.
- **Never commit secrets.** `.env` is gitignored. No credentials, tokens, or
  connection strings belong in the repository or in commit messages.
- **Serverless filesystem is ephemeral.** Anything that must survive a cold
  start goes to Vercel Blob. Local disk is development-only.
- **Do not add a `build` step to `apps/api`.** It is deployed as a Vercel
  serverless function, which bundles it. Typechecking it is what catches breakage.

## Verify before claiming done

Run all of these; do not report success on a subset:

```bash
bun run --cwd apps/api typecheck
bun run --cwd apps/api test
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
bun run lint
bun run format:check
```

The API suite is 88 tests over 5 files and runs against embedded PGlite, so it
needs no database and no network. `apps/web` has no test files yet and passes via
`--passWithNoTests`.

## Architecture

Two entrypoints share one Hono instance:

- `api/index.ts` — deployed on Vercel. Its default export **must be a callable
  `Request -> Response` function**. Hono's `app` object is not callable;
  wrapping it is required.
- `apps/api/src/index.ts` — Bun serves this default export automatically on
  `$PORT`. Do **not** add an explicit listener: it would double-bind the port and
  fail with `EADDRINUSE`.

Add new API routes under `apps/api/src/routes/` and mount them in
`apps/api/src/index.ts` with `app.route()`.

## Environment-specific constraints

- Tests force `DTS_DB_DRIVER=pglite` in `src/__tests__/setup.ts` **before**
  importing the database module. Keep that ordering.
- A relative `PGLITE_PATH` resolves against the `apps/api` package, not the
  current working directory, so scripts run from the repo root cannot open a
  different database than `db:migrate` wrote to. Preserve this.
- Use `import.meta.url` to locate files. `import.meta.dir` is Bun-only and breaks
  under Vitest and on Vercel's Node runtime.
- The Vercel function runs on Node, not Bun. Avoid Bun-only APIs in anything
  reachable from `api/index.ts`.

## Database changes

- Edit the Drizzle schema in `apps/api/src/db/schema.ts`.
- Generate SQL with `bun run db:generate`, then **review it by hand** before
  committing. Never let a generated migration drop or rewrite a column
  silently.
- Migrations are plain SQL applied by `apps/api/src/db/migrations.ts` with a
  ledger table, so `db:migrate` is idempotent.
- Prefer additive, backwards-compatible migrations; this system is in
  pre-production but the Neon database holds real intake records once deployed.

## Attachments

Attachments are private and must never be served as public URLs:

- Allowlist PDF, JPG, JPEG, PNG, WEBP only, 10 MB maximum.
- Validate MIME type, extension, **and** magic bytes.
- Serve downloads through `GET /api/attachments/:id/file` behind auth
  authorization. Do not add a public or presigned-unauthenticated path.
- Keep `storageKey` internal; strip it from API responses.

## Testing conventions

- Tests live in `apps/api/src/__tests__/` and use the harness in
  `db-harness.ts`, which applies real migrations and seeds users per role.
- `fileParallelism` is off because each suite needs its own PGlite instance.
  Do not "optimise" that away.
- The migration suite exercises the real ledger runner, not raw SQL, so
  `db/migrations.ts` breakage is caught by tests.

## Style

Prettier and ESLint are authoritative:

```bash
bun run format   # write
bun run format:check
bun run lint:fix
```

Warnings are tolerated; lint errors are not. Current warnings are mostly
`react-refresh/only-export-components`, which flags files that export both
components and helpers.