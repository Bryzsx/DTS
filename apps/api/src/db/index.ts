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

interface Driver {
  db: Database
  raw: RawExecutor
  close: () => Promise<void>
}

let cachedDriver: Driver | null = null
let driverPromise: Promise<Driver> | null = null

async function createPgliteDriver(): Promise<Driver> {
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

async function createPostgresDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and paste your Neon pooled URL.",
    )
  }
  // prepare: false avoids prepared statements which can cause issues with PgBouncer
  const client = postgres(url, { prepare: false })

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

/**
 * Initialize driver synchronously for tests (DTS_DB_DRIVER=pglite).
 * Returns null for production where we defer to lazy async initialization.
 */
function initDriverSync(): Driver | null {
  if (process.env.DTS_DB_DRIVER === "pglite") {
    // Test mode - create PGlite driver synchronously using dynamic require
    // to avoid top-level await issues in the test environment
    const { PGlite } = require("@electric-sql/pglite")
    const { drizzle } = require("drizzle-orm/pglite")

    const path = process.env.PGLITE_PATH
    const resolved = path
      ? path.includes("/") || path.includes("\\")
        ? path
        : resolve(apiRoot, path)
      : undefined
    const client = resolved ? new PGlite(resolved) : new PGlite()

    const raw: RawExecutor = {
      async script(text: string) {
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
  return null
}

// Initialize synchronously for pglite (tests and local dev)
if (process.env.DTS_DB_DRIVER === "pglite") {
  const { PGlite } = require("@electric-sql/pglite")
  const { drizzle } = require("drizzle-orm/pglite")

  const path = process.env.PGLITE_PATH
  const resolved = path
    ? path.includes("/") || path.includes("\\")
      ? path
      : resolve(apiRoot, path)
    : undefined
  const client = resolved ? new PGlite(resolved) : new PGlite()

  const raw: RawExecutor = {
    async script(text: string) {
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

  cachedDriver = {
    db: drizzle(client, { schema }) as unknown as Database,
    raw,
    close: () => client.close(),
  }
}

async function getDriverAsync(): Promise<Driver> {
  if (cachedDriver) return cachedDriver
  if (driverPromise) return driverPromise

  driverPromise = (async () => {
    if (process.env.DTS_DB_DRIVER === "pglite") {
      return createPgliteDriver()
    }
    return createPostgresDriver()
  })()

  cachedDriver = await driverPromise
  return cachedDriver
}

/**
 * Synchronous getter - throws if driver not yet initialized.
 * Tests initialize synchronously via DTS_DB_DRIVER=pglite.
 * Production code must call getDriverAsync() first or use the Proxy exports.
 */
function getDriver(): Driver {
  if (cachedDriver) return cachedDriver
  throw new Error("Database driver not initialized. Call getDriverAsync() first.")
}

/**
 * Lazily-initialized database and raw executor for serverless cold-start safety.
 * In tests (DTS_DB_DRIVER=pglite) the driver is already initialized synchronously.
 * In production the driver is created on first access via Proxy.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, _receiver) {
    const d = getDriver()
    return d.db[prop as keyof typeof d.db]
  },
})

export const raw = new Proxy({} as RawExecutor, {
  get(_target, prop, _receiver) {
    const d = getDriver()
    return d.raw[prop as keyof typeof d.raw]
  },
})

export async function closeDb() {
  if (cachedDriver) {
    await cachedDriver.close()
    cachedDriver = null
    driverPromise = null
  }
} 
 