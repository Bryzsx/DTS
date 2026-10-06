import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { RawExecutor } from "./index.js"

/**
 * Resolved from `import.meta.url` rather than `import.meta.dir`, which only
 * exists under Bun — this module also has to load under Node (Vitest, and any
 * Vercel script runtime).
 */
const here = dirname(fileURLToPath(import.meta.url))

export const MIGRATIONS_DIR = join(here, "..", "..", "migrations")

/**
 * Applies every `*.sql` file in migrations/ that is not yet recorded in
 * schema_migrations, each inside its own transaction. Files must be
 * idempotent — the ledger is a safety net, not a substitute for `IF NOT
 * EXISTS`.
 */
export async function applyMigrations(
  raw: RawExecutor,
  dir: string = MIGRATIONS_DIR,
): Promise<{ applied: string[]; skipped: string[] }> {
  await raw.script(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  )

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()
  const applied: string[] = []
  const skipped: string[] = []

  const existing = await raw.rows<{ name: string }>("SELECT name FROM schema_migrations")
  const done = new Set(existing.map((r) => r.name))

  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file)
      continue
    }
    const sql = await readFile(join(dir, file), "utf8")
    await raw.transaction(async (tx) => {
      await tx.script(sql)
      await tx.rows("INSERT INTO schema_migrations (name) VALUES ($1)", [file])
    })
    applied.push(file)
  }

  return { applied, skipped }
}
