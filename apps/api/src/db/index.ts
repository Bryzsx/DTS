import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as schema from "./schema.js"

/** Absolute path of the `apps/api` package root. */
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export type Database = PostgresJsDatabase<typeof schema>

/**
 * Raw-SQL escape hatch used by the migration runner, the test harness and the
 * few reporting queries that Drizzle cannot express ergonomically.
 */
export interface RawExecutor {
  /** Multi-statement script. Used for migration files. */
  script(text: string): Promise<void>
  /** Single statement with $1-style parameters. */
  rows<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
  /** Runs fn inside a transaction. */
  transaction<T>(fn: (tx: RawExecutor) => Promise<T>): Promise<T>
}

async function createDriver(): Promise<{
  db: Database
  raw: RawExecutor
  close: () => Promise<void>
}> {
  // Embedded Postgres for the test suite — no external database required.
  // Set DTS_DB_DRIVER=pglite to use it (PGLITE_PATH may point at a directory
  // to persist between runs; unset = fresh in-memory database).
  if (process.env.DTS_DB_DRIVER === "pglite") {
    const { PGlite } = await import("@electric-sql/pglite")
    const { drizzle } = await import("drizzle-orm/pglite")

    const path = process.env.PGLITE_PATH
    // A relative PGLITE_PATH is resolved against this package, never against the
    // current working directory, so running scripts from the repo root cannot
    // silently open a different database than `bun run db:migrate` wrote to.
    const resolved = path
      ? path.includes("/") || path.includes("\\")
        ? path
        : resolve(apiRoot, path)
      : undefined
    const client = resolved ? new PGlite(resolved) : new PGlite()

    const raw: RawExecutor = {
      async script(text) {
        await client.exec(text)
      },
      async rows<T>(text: string, params: unknown[] = []) {
        const res = await client.query<T>(text, params as never[])
        return (res.rows ?? []) as T[]
      },
      async transaction<T>(fn: (tx: RawExecutor) => Promise<T>) {
        return client.transaction(async (tx) => {
          const scoped: RawExecutor = {
            async script(text: string) {
              await tx.exec(text)
            },
            async rows<R>(text: string, params: unknown[] = []) {
              const res = await tx.query<R>(text, params as never[])
              return (res.rows ?? []) as R[]
            },
            async transaction<R>(inner: (t: RawExecutor) => Promise<R>) {
              return inner(scoped)
            },
          }
          return fn(scoped)
        }) as Promise<T>
      },
    }

    return {
      db: drizzle(client, { schema }) as unknown as Database,
      raw,
      close: () => client.close(),
    }
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and paste your Neon pooled URL.",
    )
  }
  const client = postgres(url, { max: 10 })

  const raw: RawExecutor = {
    async script(text: string) {
      await client.unsafe(text)
    },
    async rows<T>(text: string, params: unknown[] = []) {
      return (await client.unsafe(text, params as never[])) as T[]
    },
    async transaction<T>(fn: (tx: RawExecutor) => Promise<T>) {
      return client.begin(async (tx) => {
        const scoped: RawExecutor = {
          script: async (text: string) => {
            await tx.unsafe(text)
          },
          rows: async <R>(text: string, params: unknown[] = []) =>
            (await tx.unsafe(text, params as never[])) as R[],
          transaction: async <R>(inner: (t: RawExecutor) => Promise<R>) => inner(scoped),
        }
        return fn(scoped)
      }) as Promise<T>
    },
  }

  return { db: drizzlePostgresJs(client, { schema }), raw, close: () => client.end() }
}

const driver = await createDriver()

export const db = driver.db
export const raw = driver.raw
export const closeDb = driver.close
