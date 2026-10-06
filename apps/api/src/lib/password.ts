import bcrypt from "bcryptjs"

/**
 * Cost factor. 12 is bcrypt's usual production setting: high enough to be
 * expensive to brute-force, low enough to keep sign-in responsive on Vercel's
 * shared serverless CPU.
 */
const COST = 12

/**
 * bcryptjs is used deliberately rather than a native Argon2 binding. Native
 * addons have to be built and traced for the serverless platform's OS and
 * libc, which is a recurring source of deployment failures; bcryptjs is pure
 * JavaScript, so the same code runs locally and on Vercel.
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST)
}

export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(password, storedHash)
}

/**
 * A real bcrypt hash of a value nobody knows, used to spend roughly the same
 * time verifying a non-existent account as a real one, so response timing does
 * not reveal whether an email address is registered.
 */
export const TIMING_DECOY_HASH = bcrypt.hashSync(
  "dts-timing-decoy-" + "0".repeat(24),
  COST,
)