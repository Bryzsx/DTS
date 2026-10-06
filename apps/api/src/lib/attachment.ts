import { randomBytes } from "node:crypto"

/**
 * Attachment validation for DTS.
 *
 * Records here are scanned letters and memoranda, so PDFs are first-class
 * alongside photographs. The stored content type is always derived from the
 * allowlisted extension, never from the client-supplied MIME, so a renamed
 * `.exe` can never be served as anything it isn't.
 */

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.keys(EXT_TO_MIME)
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB

export class AttachmentError extends Error {}

/** Types that can carry active content and are never accepted, whatever the extension. */
const MIME_DENIED = new Set([
  "text/html",
  "image/svg+xml",
  "application/xhtml+xml",
  "text/xml",
  "application/xml",
  "application/javascript",
  "text/javascript",
  "text/plain",
  "application/json",
  "application/octet-stream-x",
])

export interface StoredAttachment {
  buffer: Buffer
  storageKey: string
  contentType: string
  filename: string
  sizeBytes: number
}

export async function saveDocumentAttachment(
  file: File,
  prefix: string,
): Promise<StoredAttachment> {
  if (!file || typeof file === "string" || file.size === 0)
    throw new AttachmentError("No file provided")
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError("Each file must be 10 MB or smaller")
  }

  const original = file.name || "attachment"
  const ext = original.split(".").pop()?.toLowerCase() || ""
  const contentType = EXT_TO_MIME[ext]
  if (!contentType) {
    throw new AttachmentError(
      `Only ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ").toUpperCase()} files are allowed`,
    )
  }

  const mime = (file.type || "").trim().toLowerCase()
  if (mime && MIME_DENIED.has(mime)) {
    throw new AttachmentError("That file type is not accepted")
  }
  // A declared MIME must agree with the extension, except for the
  // octet-stream some scanners report for PDFs.
  if (mime && mime !== "application/octet-stream") {
    const matches =
      mime === contentType ||
      (ext === "jpeg" && mime === "image/jpg") ||
      (ext === "jpg" && mime === "image/jpeg")
    if (!matches) throw new AttachmentError("File content does not match its extension")
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  // A real PDF always starts with %PDF-; checking the magic bytes stops a
  // renamed HTML/SVG payload from being stored as a "PDF".
  if (ext === "pdf" && buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new AttachmentError("That file is not a valid PDF")
  }
  if (["jpg", "jpeg", "png", "webp"].includes(ext) && buffer.length > 0) {
    const ok =
      (ext === "png" && buffer[0] === 0x89 && buffer[1] === 0x50) ||
      (["jpg", "jpeg"].includes(ext) && buffer[0] === 0xff && buffer[1] === 0xd8) ||
      (ext === "webp" && buffer.subarray(8, 12).toString("latin1") === "WEBP")
    if (!ok) throw new AttachmentError("That image file appears to be corrupted")
  }

  const safeStem =
    original
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 60) || "file"
  const storageKey = `${prefix}/${Date.now()}_${randomBytes(6).toString("hex")}_${safeStem}.${ext}`

  return { buffer, storageKey, contentType, filename: original.slice(0, 200), sizeBytes: file.size }
}
