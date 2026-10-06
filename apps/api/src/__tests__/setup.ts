import { config } from "dotenv"
import { resolve } from "path"

// vitest runs from apps/api, so .env is at cwd()/.env
config({ path: resolve(process.cwd(), ".env"), quiet: true })

// Every database-backed test runs against an in-memory PGlite instance. This
// must be set before `db/index.ts` is imported (it reads the variable at module
// load time, and that module uses a top-level await to open the driver).
process.env.DTS_DB_DRIVER = "pglite"
delete process.env.PGLITE_PATH

// Deterministic signing secret so tokens are reproducible within a run.
process.env.JWT_SECRET ??= "test-secret-not-for-production"

// Attachment tests write to disk unless told otherwise; keep that inside a
// temp dir rather than the repository.
process.env.DTS_STORAGE_DIR ??= resolve(process.cwd(), ".tmp-test-uploads")
process.env.NODE_ENV = "test"
