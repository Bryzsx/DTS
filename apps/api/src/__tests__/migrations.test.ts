import { describe, expect, it } from "vitest"
import { raw } from "../db/index.js"
import { applyMigrations } from "../db/migrations.js"

/**
 * The migration ledger itself.
 *
 * This is the code that runs against Neon in production, so it deserves direct
 * coverage: applying twice must be a no-op, and a re-run must not duplicate
 * rows or throw on the unique indexes.
 */

describe("applyMigrations", () => {
  it("applies pending migrations and records them", async () => {
    const result = await applyMigrations(raw)
    expect(result.applied).toContain("0001_init.sql")
  })

  it("is safe to re-run: nothing pending the second time", async () => {
    const result = await applyMigrations(raw)
    expect(result.applied).toEqual([])
    expect(result.skipped).toContain("0001_init.sql")
  })

  it("creates every table the API depends on", async () => {
    const rows = await raw.rows<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    )
    const tables = rows.map((r) => r.table_name)
    for (const expected of [
      "users",
      "refresh_tokens",
      "offices",
      "documents",
      "document_attachments",
      "audit_logs",
      "sequences",
      "settings",
      "schema_migrations",
    ]) {
      expect(tables).toContain(expected)
    }
  })

  it("seeds the letterhead settings so print output is never blank", async () => {
    const rows = await raw.rows<{ key: string; value: string | null }>(
      "SELECT key, value FROM settings ORDER BY key",
    )
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    expect(byKey.agency_name).toBeTruthy()
    expect(byKey.agency_subtitle).toBeTruthy()
  })

  it("backs the status vocabulary with a real CHECK constraint", async () => {
    // The zod enum catches bad input at the edge; this is the backstop that
    // holds if a row is ever written by a script or a future migration.
    await expect(
      raw.rows(
        "INSERT INTO documents (dts_reference_no, date_time_received, mode_of_receipt, document_type, sender_originating_office, subject_brief_description, status) VALUES ('DTS-2026-9999', now(), 'Email', 'Letter', 'X', 'probe', 'Nonsense')",
      ),
    ).rejects.toThrow()
  })

  it("makes the DTS reference number unique", async () => {
    await expect(
      raw.rows(
        "INSERT INTO documents (dts_reference_no, date_time_received, mode_of_receipt, document_type, sender_originating_office, subject_brief_description) VALUES ('DTS-2026-8888', now(), 'Email', 'Letter', 'X', 'dup probe')",
      ),
    ).resolves.toBeDefined()

    await expect(
      raw.rows(
        "INSERT INTO documents (dts_reference_no, date_time_received, mode_of_receipt, document_type, sender_originating_office, subject_brief_description) VALUES ('DTS-2026-8888', now(), 'Email', 'Letter', 'X', 'dup probe again')",
      ),
    ).rejects.toThrow()
  })

  it("normalises user emails case-insensitively", async () => {
    await expect(
      raw.rows(
        "INSERT INTO users (name, email, role) VALUES ('Probe A', 'Mixed.Case@dts.test', 'viewer')",
      ),
    ).resolves.toBeDefined()
    await expect(
      raw.rows(
        "INSERT INTO users (name, email, role) VALUES ('Probe B', 'mixed.case@dts.test', 'viewer')",
      ),
    ).rejects.toThrow()
  })
})
