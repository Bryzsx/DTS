import { describe, expect, it } from "vitest"
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  AttachmentError,
  MAX_ATTACHMENT_BYTES,
  saveDocumentAttachment,
} from "../lib/attachment.js"

function makeFile(name: string, type: string, bytes: Buffer | Uint8Array): File {
  const buffer = Buffer.from(bytes)
  return new File([buffer], name, { type })
}

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const PDF_HEADER = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n", "latin1")

describe("saveDocumentAttachment", () => {
  it("accepts a valid PDF and derives its type from the extension", async () => {
    const result = await saveDocumentAttachment(
      makeFile("letter.pdf", "application/pdf", PDF_HEADER),
      "documents/1",
    )
    expect(result.contentType).toBe("application/pdf")
    expect(result.storageKey).toMatch(/^documents\/1\/\d+_[0-9a-f]{12}_letter\.pdf$/)
    expect(result.sizeBytes).toBe(PDF_HEADER.length)
  })

  it("accepts PNG, JPEG and WEBP", async () => {
    const png = await saveDocumentAttachment(
      makeFile("scan.png", "image/png", PNG_HEADER),
      "documents/1",
    )
    expect(png.contentType).toBe("image/png")

    const jpeg = await saveDocumentAttachment(
      makeFile("photo.jpg", "image/jpeg", JPEG_HEADER),
      "documents/1",
    )
    expect(jpeg.contentType).toBe("image/jpeg")

    const webpBytes = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])
    const webp = await saveDocumentAttachment(
      makeFile("pic.webp", "image/webp", webpBytes),
      "documents/1",
    )
    expect(webp.contentType).toBe("image/webp")
  })

  it("rejects an extension outside the allowlist", async () => {
    await expect(
      saveDocumentAttachment(
        makeFile("payload.exe", "application/octet-stream", Buffer.from("MZ")),
        "documents/1",
      ),
    ).rejects.toBeInstanceOf(AttachmentError)
  })

  it("rejects a file over the size limit", async () => {
    const tooBig = Buffer.concat([PDF_HEADER, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)])
    await expect(
      saveDocumentAttachment(makeFile("big.pdf", "application/pdf", tooBig), "documents/1"),
    ).rejects.toThrow(/10 MB or smaller/)
  })

  it("rejects an empty file", async () => {
    await expect(
      saveDocumentAttachment(
        makeFile("empty.pdf", "application/pdf", Buffer.alloc(0)),
        "documents/1",
      ),
    ).rejects.toBeInstanceOf(AttachmentError)
  })

  it("rejects a PDF that is really HTML", async () => {
    const html = Buffer.from("<!doctype html><script>alert(1)</script>", "utf8")
    await expect(
      saveDocumentAttachment(makeFile("evil.pdf", "application/pdf", html), "documents/1"),
    ).rejects.toThrow(/not a valid PDF/)
  })

  it("rejects a renamed HTML payload declared as HTML", async () => {
    const html = Buffer.from("<html>phish</html>", "utf8")
    await expect(
      saveDocumentAttachment(makeFile("page.html", "text/html", html), "documents/1"),
    ).rejects.toBeInstanceOf(AttachmentError)
  })

  it("rejects an image whose magic bytes contradict the extension", async () => {
    await expect(
      saveDocumentAttachment(makeFile("fake.png", "image/png", PDF_HEADER), "documents/1"),
    ).rejects.toThrow(/corrupted/)
  })

  it("rejects a declared MIME that disagrees with the extension", async () => {
    // Both types are individually allowlisted, so only the mismatch catches it.
    await expect(
      saveDocumentAttachment(makeFile("letter.pdf", "image/png", PDF_HEADER), "documents/1"),
    ).rejects.toThrow(/does not match its extension/)
  })

  it("rejects a declared MIME that is not allowlisted at all", async () => {
    await expect(
      saveDocumentAttachment(makeFile("letter.pdf", "text/html", PDF_HEADER), "documents/1"),
    ).rejects.toThrow(/not accepted/)
  })

  it("accepts the octet-stream MIME some scanners report for PDFs", async () => {
    const result = await saveDocumentAttachment(
      makeFile("letter.pdf", "application/octet-stream", PDF_HEADER),
      "documents/1",
    )
    expect(result.contentType).toBe("application/pdf")
  })

  it("strips path characters out of the generated storage key", async () => {
    const result = await saveDocumentAttachment(
      makeFile("../../../etc/passwd.pdf", "application/pdf", PDF_HEADER),
      "documents/7",
    )
    expect(result.storageKey).not.toContain("..")
    expect(result.storageKey.startsWith("documents/7/")).toBe(true)
    // The original name is preserved for display, bounded in length.
    expect(result.filename.length).toBeLessThanOrEqual(200)
  })

  it("generates a unique key for two uploads of the same name", async () => {
    const a = await saveDocumentAttachment(
      makeFile("letter.pdf", "application/pdf", PDF_HEADER),
      "documents/1",
    )
    const b = await saveDocumentAttachment(
      makeFile("letter.pdf", "application/pdf", PDF_HEADER),
      "documents/1",
    )
    expect(a.storageKey).not.toBe(b.storageKey)
  })

  it("advertises only PDF and image extensions as allowed", () => {
    expect(ALLOWED_ATTACHMENT_EXTENSIONS).toContain("pdf")
    expect(ALLOWED_ATTACHMENT_EXTENSIONS).not.toContain("html")
    expect(ALLOWED_ATTACHMENT_EXTENSIONS).not.toContain("svg")
  })
})
