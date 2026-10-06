import { raw, closeDb } from "./src/db/index.js"
import { applyMigrations } from "./src/db/migrations.js"

/**
 * Applies pending migrations. Safe to re-run: the schema_migrations ledger
 * skips anything already applied.
 */
async function main() {
  const { applied, skipped } = await applyMigrations(raw)
  for (const file of skipped) console.log(`skip  ${file} (already applied)`)
  for (const file of applied) console.log(`apply ${file}`)
  console.log(
    applied.length === 0 ? "no pending migrations" : `${applied.length} migration(s) applied`,
  )
  await closeDb()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
