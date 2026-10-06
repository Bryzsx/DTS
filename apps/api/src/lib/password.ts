import { hash, verify } from "@node-rs/argon2"

export function hashPassword(password: string): Promise<string> {
  return hash(password)
}

export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return verify(storedHash, password)
}
