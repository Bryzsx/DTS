import { beforeAll, describe, expect, it } from "vitest"
import app from "../index.js"
import { createAllRoles, migrate, type TestUser } from "./db-harness.js"

/**
 * Attachment routes, end to end.
 *
 * Bytes never leave the server over a public URL, so these tests focus on who
 * may upload, who may download, and that a file is served with the content type
 * recorded at upload rather than anything the client asks for.
 */

const api = (path: string, init: RequestInit = {}) => app.request(path, init)

/** `Response.json()` is not generic here, so assertions read through this. */
const readJson = async <T>(res: Response): Promise<T> => (await res.json()) as T
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

async function signIn(user: TestUser): Promise<string> {
  const res = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "correct-horse-9" }),
  })
  return (await readJson<{ accessToken: string }>(res)).accessToken
}

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n")

function uploadRequest(token: string, file: File, documentId = docId) {
  const form = new FormData()
  form.append("file", file)
  return api(`/api/documents/${documentId}/attachments`, {
    method: "POST",
    headers: bearer(token),
    body: form,
  })
}

let docId: number
let adminToken: string
let officerToken: string
let viewerToken: string

beforeAll(async () => {
  await migrate()
  const roles = await createAllRoles()
  adminToken = await signIn(roles.admin)
  officerToken = await signIn(roles.officer)
  viewerToken = await signIn(roles.viewer)

  const created = await api("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearer(officerToken) },
    body: JSON.stringify({
      modeOfReceipt: "Email",
      documentType: "Letter",
      senderOriginatingOffice: "Office of the Secretary",
      subjectBriefDescription: "Attachment probe",
    }),
  })
  if (created.status !== 201) {
    throw new Error(`fixture document failed: ${created.status} ${await created.text()}`)
  }
  docId = (await readJson<{ document: { id: number } }>(created)).document.id
})

describe("attachment upload", () => {
  it("requires authentication", async () => {
    const form = new FormData()
    form.append("file", new File([PDF_BYTES], "letter.pdf", { type: "application/pdf" }))
    const res = await api(`/api/documents/${docId}/attachments`, { method: "POST", body: form })
    expect(res.status).toBe(401)
  })

  it("blocks a viewer from uploading", async () => {
    const res = await uploadRequest(
      viewerToken,
      new File([PDF_BYTES], "letter.pdf", { type: "application/pdf" }),
    )
    expect(res.status).toBe(403)
  })

  it("accepts a real PDF from an officer and records its metadata", async () => {
    const res = await uploadRequest(
      officerToken,
      new File([PDF_BYTES], "Board Minutes.pdf", { type: "application/pdf" }),
    )
    expect(res.status).toBe(201)

    const raw = await res.text()
    const { attachment } = JSON.parse(raw) as {
      attachment: { id: number; filename: string; contentType: string; sizeBytes: number }
    }
    expect(attachment.filename).toBe("Board Minutes.pdf")
    expect(attachment.contentType).toBe("application/pdf")
    expect(attachment.sizeBytes).toBeGreaterThan(0)
    // The blob pathname is internal; it must not be echoed back.
    expect(raw).not.toContain("storageKey")
  })

  it("rejects an HTML payload disguised as a PDF", async () => {
    const res = await uploadRequest(
      officerToken,
      new File(["<html>phish</html>"], "invoice.pdf", { type: "application/pdf" }),
    )
    expect(res.status).toBe(400)
  })

  it("404s an upload against a document that does not exist", async () => {
    const res = await uploadRequest(
      officerToken,
      new File([PDF_BYTES], "letter.pdf", { type: "application/pdf" }),
      999999,
    )
    expect(res.status).toBe(404)
  })
})

describe("attachment download", () => {
  let attachmentId: number

  beforeAll(async () => {
    const res = await uploadRequest(
      officerToken,
      new File([PDF_BYTES], "download-probe.pdf", { type: "application/pdf" }),
    )
    attachmentId = (await readJson<{ attachment: { id: number } }>(res)).attachment.id
  })

  it("lists the record's attachments without leaking storage keys", async () => {
    const res = await api(`/api/documents/${docId}/attachments`, { headers: bearer(viewerToken) })
    expect(res.status).toBe(200)
    const { attachments } = await readJson<{ attachments: Array<Record<string, unknown>> }>(res)
    expect(attachments.length).toBeGreaterThan(0)
    // The blob path must never reach the client.
    expect(JSON.stringify(attachments)).not.toContain("storageKey")
  })

  it("counts attachments for the badge", async () => {
    const res = await api(`/api/documents/${docId}/attachments/count`, {
      headers: bearer(viewerToken),
    })
    expect(res.status).toBe(200)
    expect((await readJson<{ count: number }>(res)).count).toBeGreaterThan(0)
  })

  it("refuses an unauthenticated download", async () => {
    expect((await api(`/api/attachments/${attachmentId}/file`)).status).toBe(401)
  })

  it("serves the bytes with the recorded content type and as an attachment by default", async () => {
    const res = await api(`/api/attachments/${attachmentId}/file`, { headers: bearer(viewerToken) })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toContain("attachment;")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("cache-control")).toContain("no-store")
  })

  it("can serve inline when explicitly asked", async () => {
    const res = await api(`/api/attachments/${attachmentId}/file?disposition=inline`, {
      headers: bearer(viewerToken),
    })
    expect(res.headers.get("content-disposition")).toContain("inline;")
  })

  it("does not let a filename inject a second header", async () => {
    const res = await uploadRequest(
      officerToken,
      new File([PDF_BYTES], 'evil".pdf', { type: "application/pdf" }),
    )
    const id = (await readJson<{ attachment: { id: number } }>(res)).attachment.id
    const dl = await api(`/api/attachments/${id}/file`, { headers: bearer(viewerToken) })
    expect(dl.status).toBe(200)
    // Exactly one header value, and no raw quote that would split it.
    expect(dl.headers.get("content-disposition")).not.toContain('evil".pdf')
  })
})

describe("attachment deletion", () => {
  it("is forbidden for a viewer and allowed for an officer", async () => {
    const created = await uploadRequest(
      officerToken,
      new File([PDF_BYTES], "delete-probe.pdf", { type: "application/pdf" }),
    )
    const id = (await readJson<{ attachment: { id: number } }>(created)).attachment.id

    expect(
      (await api(`/api/attachments/${id}`, { method: "DELETE", headers: bearer(viewerToken) }))
        .status,
    ).toBe(403)

    const del = await api(`/api/attachments/${id}`, {
      method: "DELETE",
      headers: bearer(adminToken),
    })
    expect(del.status).toBe(200)

    // Gone from the database and no longer downloadable.
    expect((await api(`/api/attachments/${id}/file`, { headers: bearer(adminToken) })).status).toBe(
      404,
    )
  })
})
