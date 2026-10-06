import { beforeAll, describe, expect, it } from "vitest"
import app from "../index.js"
import { createAllRoles, migrate, TEST_PASSWORD, type TestUser } from "./db-harness.js"

/**
 * End-to-end API tests against in-memory PGlite.
 *
 * These exercise the real Hono app — middleware, zod validation, permission
 * checks and SQL — over `app.request()`, so a contract break between the route
 * and the database fails here rather than in a browser.
 */

/** Thin wrapper so every call site has the same (path, init) shape. */
const api = (path: string, init: RequestInit = {}) => app.request(path, init)

/** `Response.json()` is not generic here, so assertions read through this. */
const readJson = async <T>(res: Response): Promise<T> => (await res.json()) as T

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

const postJson = (path: string, body: unknown, token?: string) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? bearer(token) : {}) },
    body: JSON.stringify(body),
  })

const patchJson = (path: string, body: unknown, token: string) =>
  api(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...bearer(token) },
    body: JSON.stringify(body),
  })

async function signIn(user: TestUser): Promise<string> {
  const res = await postJson("/api/auth/login", { email: user.email, password: TEST_PASSWORD })
  if (res.status !== 200)
    throw new Error(`login failed for ${user.role}: ${res.status} ${await res.text()}`)
  return (await readJson<{ accessToken: string }>(res)).accessToken
}

/** Minimal intake payload; override individual fields per test. */
function intake(overrides: Record<string, unknown> = {}) {
  return {
    modeOfReceipt: "Email",
    documentType: "Letter",
    senderOriginatingOffice: "Office of the Secretary",
    subjectBriefDescription: "Request for additional funding",
    urgencyLevel: "Routine",
    ...overrides,
  }
}

const uniqueEmail = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}@dts.test`

let admin: TestUser
let officer: TestUser
let rd: TestUser
let viewer: TestUser
let adminToken: string
let officerToken: string
let rdToken: string
let viewerToken: string

beforeAll(async () => {
  await migrate()
  const roles = await createAllRoles()
  admin = roles.admin
  officer = roles.officer
  rd = roles.rd
  viewer = roles.viewer
  adminToken = await signIn(admin)
  officerToken = await signIn(officer)
  rdToken = await signIn(rd)
  viewerToken = await signIn(viewer)
})

describe("authentication", () => {
  it("rejects an unknown account without revealing that it is unknown", async () => {
    const res = await postJson("/api/auth/login", {
      email: "nobody@dts.test",
      password: "whatever-123",
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Invalid email or password" })
  })

  it("returns the same error for a wrong password", async () => {
    const res = await postJson("/api/auth/login", {
      email: officer.email,
      password: "wrong-password",
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Invalid email or password" })
  })

  it("signs a valid account in and returns accessToken (not token)", async () => {
    const res = await postJson("/api/auth/login", { email: officer.email, password: TEST_PASSWORD })
    expect(res.status).toBe(200)
    const body = await readJson<{ accessToken: string; user: { role: string } }>(res)
    expect(body.accessToken).toBeTruthy()
    expect(body.user.role).toBe("officer")
    expect("token" in body).toBe(false)
  })

  it("refuses every document route without a token", async () => {
    expect((await api("/api/documents")).status).toBe(401)
    expect((await postJson("/api/documents", intake())).status).toBe(401)
  })

  it("rejects a token that is not a valid JWT", async () => {
    const res = await api("/api/documents", { headers: bearer("not.a.real.token") })
    expect(res.status).toBe(401)
  })

  it("resolves /api/auth/me from the database, not from the token claims", async () => {
    const res = await api("/api/auth/me", { headers: bearer(officerToken) })
    expect(res.status).toBe(200)
    expect((await readJson<{ user: { email: string } }>(res)).user.email).toBe(officer.email)
  })

  it("locks a disabled account out and kills its live token", async () => {
    const { db } = await import("../db/index.js")
    const { users } = await import("../db/schema.js")
    const { eq } = await import("drizzle-orm")

    await db.update(users).set({ status: "disabled" }).where(eq(users.id, viewer.id))
    expect(
      (await postJson("/api/auth/login", { email: viewer.email, password: TEST_PASSWORD })).status,
    ).toBe(403)
    expect((await api("/api/documents", { headers: bearer(viewerToken) })).status).toBe(403)

    await db.update(users).set({ status: "active" }).where(eq(users.id, viewer.id))
  })
})

describe("intake", () => {
  it("mints an atomic DTS-YYYY-NNNN reference and records the creator", async () => {
    const res = await postJson("/api/documents", intake(), officerToken)
    expect(res.status).toBe(201)

    const { document: doc } = await readJson<{
      document: { id: number; dtsReferenceNo: string; createdBy: number }
    }>(res)
    expect(doc.dtsReferenceNo).toMatch(/^DTS-\d{4}-\d{4}$/)
    expect(doc.createdBy).toBe(officer.id)
  })

  it("never reuses a reference number across concurrent inserts", async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        postJson(
          "/api/documents",
          intake({ subjectBriefDescription: `Concurrency probe ${i}` }),
          officerToken,
        ),
      ),
    )
    expect(created.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 201])

    const numbers = new Set<number>()
    for (const res of created) {
      const { document } = await readJson<{ document: { dtsReferenceNo: string } }>(res)
      numbers.add(Number(document.dtsReferenceNo.split("-")[2]))
    }
    expect(numbers.size).toBe(5)
  })

  it("rejects intake missing the required sender and subject", async () => {
    const res = await postJson(
      "/api/documents",
      { modeOfReceipt: "Email", documentType: "Letter" },
      officerToken,
    )
    expect(res.status).toBe(400)
  })

  it("rejects a vocabulary value outside the enum", async () => {
    const res = await postJson("/api/documents", intake({ urgencyLevel: "Whenever" }), officerToken)
    expect(res.status).toBe(400)
  })

  it("blocks viewers from creating a record", async () => {
    expect((await postJson("/api/documents", intake(), viewerToken)).status).toBe(403)
  })
})

describe("field-level authorisation", () => {
  let docId: number

  beforeAll(async () => {
    const res = await postJson(
      "/api/documents",
      intake({ subjectBriefDescription: "Authorisation probe" }),
      officerToken,
    )
    docId = (await readJson<{ document: { id: number } }>(res)).document.id
  })

  it("lets an officer record routing and close-out fields", async () => {
    const res = await patchJson(
      `/api/documents/${docId}`,
      {
        actionRequired: "Draft the endorsement",
        deadlineDueDate: "2026-03-01",
        status: "Under Review",
        remarks: "Chased by the sender",
      },
      officerToken,
    )
    expect(res.status).toBe(200)
    const { document } = await readJson<{ document: { status: string; remarks: string } }>(res)
    expect(document.status).toBe("Under Review")
    expect(document.remarks).toBe("Chased by the sender")
  })

  it("refuses to let an officer write the RD's disposition, naming the field", async () => {
    const res = await patchJson(
      `/api/documents/${docId}`,
      { rdDisposition: "For approval" },
      officerToken,
    )
    expect(res.status).toBe(403)
    const body = await readJson<{ code: string; fields: string[] }>(res)
    expect(body.code).toBe("FORBIDDEN_FIELDS")
    expect(body.fields).toContain("rdDisposition")
  })

  it("lets the RD write the disposition", async () => {
    const res = await patchJson(
      `/api/documents/${docId}`,
      { rdDisposition: "For approval", rdDecisionDate: "2026-02-01" },
      rdToken,
    )
    expect(res.status).toBe(200)
    expect(
      (await readJson<{ document: { rdDisposition: string } }>(res)).document.rdDisposition,
    ).toBe("For approval")
  })

  it("refuses viewers any edit at all", async () => {
    expect(
      (await patchJson(`/api/documents/${docId}`, { remarks: "tampered" }, viewerToken)).status,
    ).toBe(403)
  })

  it("ignores a client attempt to set server-owned columns", async () => {
    const res = await patchJson(
      `/api/documents/${docId}`,
      { id: 999, createdBy: 999, dtsReferenceNo: "DTS-2000-9999" },
      officerToken,
    )
    expect(res.status).toBe(400)
  })

  it("reports each changed field in the audit history, attributed to a real account", async () => {
    const res = await api(`/api/documents/${docId}/audit`, { headers: bearer(officerToken) })
    expect(res.status).toBe(200)
    const { history } = await readJson<{
      history: Array<{ action: string; detail: { field?: string }; userName: string | null }>
    }>(res)
    expect(history.some((h) => h.action === "document.created")).toBe(true)
    expect(history.some((h) => h.detail?.field === "remarks")).toBe(true)
    expect(history.every((h) => h.userName !== null)).toBe(true)
  })
})

describe("workflow transitions", () => {
  let docId: number

  beforeAll(async () => {
    const res = await postJson(
      "/api/documents",
      intake({ subjectBriefDescription: "Workflow probe" }),
      officerToken,
    )
    docId = (await readJson<{ document: { id: number } }>(res)).document.id
  })

  it("allows Received -> Under Review -> For RD Action", async () => {
    expect(
      (await patchJson(`/api/documents/${docId}`, { status: "Under Review" }, officerToken)).status,
    ).toBe(200)
    expect(
      (await patchJson(`/api/documents/${docId}`, { status: "For RD Action" }, officerToken))
        .status,
    ).toBe(200)
  })

  it("rejects a jump that skips the workflow", async () => {
    const res = await patchJson(`/api/documents/${docId}`, { status: "Completed" }, officerToken)
    expect(res.status).toBe(400)
    expect((await readJson<{ code: string }>(res)).code).toBe("INVALID_TRANSITION")
  })

  it("refuses an officer's attempt to reopen a closed record", async () => {
    expect(
      (await patchJson(`/api/documents/${docId}`, { status: "Closed" }, officerToken)).status,
    ).toBe(200)
    expect(
      (await patchJson(`/api/documents/${docId}`, { status: "Under Review" }, officerToken)).status,
    ).toBe(400)
  })

  it("lets an administrator reopen a closed record", async () => {
    const res = await patchJson(`/api/documents/${docId}`, { status: "Under Review" }, adminToken)
    expect(res.status).toBe(200)
  })
})

describe("register listing", () => {
  let probeId: number

  beforeAll(async () => {
    const res = await postJson(
      "/api/documents",
      intake({
        subjectBriefDescription: "Filter probe",
        urgencyLevel: "Urgent",
        documentType: "Memorandum",
      }),
      officerToken,
    )
    probeId = (await readJson<{ document: { id: number } }>(res)).document.id
  })

  it("filters by status", async () => {
    const res = await api("/api/documents?status=Received&limit=100", {
      headers: bearer(viewerToken),
    })
    expect(res.status).toBe(200)
    const { documents: list } = await readJson<{ documents: Array<{ status: string }> }>(res)
    expect(list.every((d) => d.status === "Received")).toBe(true)
  })

  it("searches the subject case-insensitively", async () => {
    const res = await api("/api/documents?q=FILTER PROBE", { headers: bearer(viewerToken) })
    const { documents: list } = await readJson<{ documents: Array<{ id: number }> }>(res)
    expect(list.map((d) => d.id)).toContain(probeId)
  })

  it("paginates and reports a stable total", async () => {
    const res = await api("/api/documents?limit=2&page=1&sort=received_desc", {
      headers: bearer(viewerToken),
    })
    const body = await readJson<{ documents: unknown[]; total: number; page: number }>(res)
    expect(body.page).toBe(1)
    expect(body.documents.length).toBeLessThanOrEqual(2)
    expect(body.total).toBeGreaterThan(2)
  })

  it("hides archived records unless asked for them", async () => {
    const before = await api("/api/documents?limit=200", { headers: bearer(viewerToken) })
    const { total: beforeTotal } = await readJson<{ total: number }>(before)

    expect(
      (await api(`/api/documents/${probeId}`, { method: "DELETE", headers: bearer(adminToken) }))
        .status,
    ).toBe(200)

    const after = await api("/api/documents?limit=200", { headers: bearer(viewerToken) })
    expect((await readJson<{ total: number }>(after)).total).toBe(beforeTotal - 1)

    const withArchived = await api("/api/documents?limit=200&includeArchived=true", {
      headers: bearer(viewerToken),
    })
    expect((await readJson<{ total: number }>(withArchived)).total).toBe(beforeTotal)
  })

  it("rejects an unknown sort key instead of silently defaulting", async () => {
    expect(
      (await api("/api/documents?sort=whatever", { headers: bearer(viewerToken) })).status,
    ).toBe(400)
  })
})

describe("archiving is non-destructive", () => {
  it("refuses a non-admin archive and leaves the row readable", async () => {
    const created = await postJson("/api/documents", intake(), officerToken)
    const { document: doc } = await readJson<{ document: { id: number } }>(created)

    expect(
      (await api(`/api/documents/${doc.id}`, { method: "DELETE", headers: bearer(officerToken) }))
        .status,
    ).toBe(403)
    expect((await api(`/api/documents/${doc.id}`, { headers: bearer(viewerToken) })).status).toBe(
      200,
    )
  })

  it("refuses to edit an archived record", async () => {
    const created = await postJson("/api/documents", intake(), officerToken)
    const { document: doc } = await readJson<{ document: { id: number } }>(created)
    expect(
      (await api(`/api/documents/${doc.id}`, { method: "DELETE", headers: bearer(adminToken) }))
        .status,
    ).toBe(200)

    const res = await patchJson(
      `/api/documents/${doc.id}`,
      { remarks: "after the fact" },
      adminToken,
    )
    expect(res.status).toBe(409)
  })
})

describe("exports", () => {
  it("serves a CSV that neutralises spreadsheet formula injection", async () => {
    const res = await api("/api/export/documents.csv", { headers: bearer(viewerToken) })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    // A cell starting with = would execute when the file is opened in Excel.
    expect(await res.text()).not.toMatch(/^\s*[=+@-]/m)
  })

  it("serves a real XLSX archive", async () => {
    const res = await api("/api/export/documents.xlsx", { headers: bearer(viewerToken) })
    expect(res.status).toBe(200)
    const buf = Buffer.from(await res.arrayBuffer())
    // ZIP local file header — a genuine workbook, not a CSV in disguise.
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK")
  })

  it("requires authentication", async () => {
    expect((await api("/api/export/documents.csv")).status).toBe(401)
    expect((await api("/api/export/documents.xlsx")).status).toBe(401)
  })
})

describe("reporting", () => {
  it("returns a dashboard total that agrees with the register", async () => {
    const stats = await api("/api/reports/stats", { headers: bearer(viewerToken) })
    expect(stats.status).toBe(200)
    const list = await api("/api/documents?limit=200", { headers: bearer(viewerToken) })
    const { total: fromRegister } = await readJson<{ total: number }>(list)
    expect((await readJson<{ total: number }>(stats)).total).toBe(fromRegister)
  })

  it("exposes the printable register payload", async () => {
    const res = await api("/api/reports/register", { headers: bearer(viewerToken) })
    expect(res.status).toBe(200)
    expect(Array.isArray((await readJson<{ documents: unknown[] }>(res)).documents)).toBe(true)
  })
})

describe("administration", () => {
  it("lets an admin create an account and forbids an officer the same", async () => {
    const created = await postJson(
      "/api/admin/users",
      {
        name: "New Officer",
        email: uniqueEmail("new"),
        password: "temp-pass-123",
        role: "officer",
      },
      adminToken,
    )
    expect(created.status).toBe(201)

    const denied = await postJson(
      "/api/admin/users",
      { name: "Sneaky", email: uniqueEmail("x"), password: "temp-pass-123", role: "admin" },
      officerToken,
    )
    expect(denied.status).toBe(403)
  })

  it("rejects a duplicate email", async () => {
    const res = await postJson(
      "/api/admin/users",
      { name: "Dup", email: officer.email, password: "temp-pass-123", role: "officer" },
      adminToken,
    )
    expect(res.status).toBe(409)
  })

  it("rejects a weak password", async () => {
    const res = await postJson(
      "/api/admin/users",
      { name: "Weak", email: uniqueEmail("weak"), password: "short", role: "viewer" },
      adminToken,
    )
    expect(res.status).toBe(400)
  })

  it("keeps the system audit trail away from non-admins", async () => {
    expect((await api("/api/admin/audit", { headers: bearer(officerToken) })).status).toBe(403)
    expect((await api("/api/admin/audit", { headers: bearer(adminToken) })).status).toBe(200)
  })

  it("lets any authenticated user read the office list used by routing", async () => {
    for (const token of [adminToken, officerToken, rdToken, viewerToken]) {
      const res = await api("/api/admin/offices", { headers: bearer(token) })
      expect(res.status).toBe(200)
      expect(Array.isArray((await readJson<{ offices: unknown[] }>(res)).offices)).toBe(true)
    }
  })

  it("lets any authenticated user read the letterhead settings but only an admin change them", async () => {
    expect((await api("/api/admin/settings", { headers: bearer(viewerToken) })).status).toBe(200)

    const denied = await postJson("/api/admin/offices", { name: "Sneaky Office" }, officerToken)
    expect(denied.status).toBe(403)
    expect(
      (await postJson("/api/admin/offices", { name: "Records Unit" }, adminToken)).status,
    ).toBe(201)

    const put = await api("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...bearer(viewerToken) },
      body: JSON.stringify({ agency_name: "Hacked" }),
    })
    expect(put.status).toBe(403)
  })

  it("creates a duplicate-free office list entry", async () => {
    const again = await postJson("/api/admin/offices", { name: "Records Unit" }, adminToken)
    expect(again.status).toBe(409)
  })
})
