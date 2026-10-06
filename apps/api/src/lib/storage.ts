import { put, get, del } from "@vercel/blob"
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

/**
 * Attachment storage.
 *
 * DTS blobs are **private** (a Vercel Blob private store) and are only ever
 * served through an authenticated API route. A scanned government letter must
 * not be readable by anyone who guesses or shares its URL, so no public blob
 * URL is ever handed out.
 *
 * Without BLOB_READ_WRITE_TOKEN (local development and tests) files land in
 * `uploads/` — or DTS_STORAGE_DIR when set — and are read back through the same
 * authenticated route.
 */

export const UPLOADS_DIR = process.env.DTS_STORAGE_DIR
  ? resolve(process.env.DTS_STORAGE_DIR)
  : join(process.cwd(), "uploads")

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
}

export const mimeFor = (filename: string): string =>
  MIME[filename.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream"

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

/** Stores bytes and returns the storage key (a blob pathname, or a local filename). */
/**
 * Resolves a server-generated storage key to an absolute path inside
 * UPLOADS_DIR, refusing anything that escapes it.
 *
 * The containment check uses `relative()` rather than a string prefix, because
 * a prefix test has to hard-code the platform separator and silently rejects
 * every valid key on Windows.
 */
function localPathFor(storageKey: string): string | null {
  if (!storageKey || storageKey.includes("\0")) return null
  if (isAbsolute(storageKey)) return null
  const target = resolve(UPLOADS_DIR, storageKey)
  const rel = relative(UPLOADS_DIR, target)
  if (rel.startsWith("..") || isAbsolute(rel)) return null
  return target
}

export async function saveAttachment(options: {
  buffer: Buffer
  storageKey: string
  contentType: string
}): Promise<string> {
  if (useBlob()) {
    await put(options.storageKey, options.buffer, {
      access: "private",
      contentType: options.contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return options.storageKey
  }

  const target = localPathFor(options.storageKey)
  if (!target) throw new Error("Invalid storage key")
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, options.buffer)
  return options.storageKey
}

export async function readAttachment(
  storageKey: string,
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  if (useBlob()) {
    try {
      const result = await get(storageKey, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      if (!result || result.statusCode !== 200) return null
      const res = new Response(result.stream as unknown as ReadableStream)
      return { data: await res.arrayBuffer(), contentType: result.blob.contentType }
    } catch {
      return null
    }
  }

  // Defence in depth: storage keys are server-generated, but never let one
  // escape the uploads directory.
  const target = localPathFor(storageKey)
  if (!target) return null
  try {
    const bytes = await readFile(target)
    return { data: new Uint8Array(bytes).buffer as ArrayBuffer, contentType: mimeFor(storageKey) }
  } catch {
    return null
  }
}

export async function deleteAttachment(storageKey: string): Promise<void> {
  if (useBlob()) {
    try {
      await del(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN })
    } catch {
      /* best effort — the row is what matters */
    }
    return
  }
  const target = localPathFor(storageKey)
  if (!target) return
  try {
    await unlink(target)
  } catch {
    /* already gone */
  }
}
