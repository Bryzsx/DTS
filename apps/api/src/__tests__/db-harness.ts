import { db, raw } from "../db/index.js"
import { applyMigrations } from "../db/migrations.js"
import { users, type Role } from "../db/schema.js"
import { hashPassword } from "../lib/password.js"

/**
 * Shared PGlite harness.
 *
 * The suite has no external database: `setup.ts` sets DTS_DB_DRIVER=pglite
 * before `db/index.js` is imported, so importing this module gives you an
 * already-connected in-memory Postgres.
 *
 * Migrations run through the *real* `applyMigrations` ledger rather than by
 * executing SQL directly, so `bun run db:migrate` and the test suite exercise
 * the same code path against the same files.
 */
let migrated = false

export async function migrate(): Promise<void> {
  if (migrated) return
  await applyMigrations(raw)
  migrated = true
}

export interface TestUser {
  id: number
  name: string
  email: string
  password: string
  role: Role
}

export const TEST_PASSWORD = "correct-horse-9"

export async function createUser(
  role: Role,
  overrides: Partial<Omit<TestUser, "role" | "password">> = {},
): Promise<TestUser> {
  const email = overrides.email ?? `${role}-${crypto.randomUUID().slice(0, 8)}@dts.test`
  const name = overrides.name ?? `${role} tester`
  const [row] = await db
    .insert(users)
    .values({
      name,
      email,
      role,
      passwordHash: await hashPassword(TEST_PASSWORD),
      status: "active",
    })
    .returning({ id: users.id })
  return { id: row.id, name, email, password: TEST_PASSWORD, role }
}

/** One user per built-in role, for permission matrices. */
export async function createAllRoles(): Promise<Record<Role, TestUser>> {
  return {
    admin: await createUser("admin"),
    officer: await createUser("officer"),
    rd: await createUser("rd"),
    viewer: await createUser("viewer"),
  }
}
