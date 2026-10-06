/**
 * Creates the first administrator account.
 *
 *   bun run seed:admin
 *
 * Reads SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from the
 * environment so the password never has to appear in shell history.
 */
import { eq } from "drizzle-orm"
import { db } from "./src/db/index.js"
import { users } from "./src/db/schema.js"
import { hashPassword } from "./src/lib/password.js"
import { createLogger } from "./src/lib/logger.js"

const log = createLogger("seed")

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD ?? ""
  const name = (process.env.SEED_ADMIN_NAME ?? "System Administrator").trim()

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    log.error("SEED_ADMIN_EMAIL is required and must be a valid address")
    process.exit(1)
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    log.error(
      "SEED_ADMIN_PASSWORD must be at least 10 characters and include a letter and a number",
    )
    process.exit(1)
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing.length > 0) {
    log.info(`Administrator ${email} already exists — nothing to do`)
    return
  }

  const created = (
    await db
      .insert(users)
      .values({ name, email, role: "admin", passwordHash: await hashPassword(password) })
      .returning({ id: users.id, email: users.email, role: users.role })
  )[0]

  log.info(`Created administrator ${created!.email} (id ${created!.id})`)
  log.info("Sign in and change this password immediately, then create the real accounts.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
