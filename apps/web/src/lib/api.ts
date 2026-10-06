const API_BASE = import.meta.env.VITE_API_URL ?? ""

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal }

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Refreshes the access token at most once even if several requests race. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) return null
      const data = (await res.json()) as { accessToken?: string }
      accessToken = data.accessToken ?? null
      return accessToken
    } catch {
      return null
    } finally {
      // Clear on the next tick so concurrent callers still share this attempt.
      setTimeout(() => {
        refreshPromise = null
      }, 0)
    }
  })()
  return refreshPromise
}

async function parse(res: Response) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

export async function api<T = unknown>(
  path: string,
  options: Options = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  })

  // One transparent refresh-and-retry on an expired access token.
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const fresh = await refreshAccessToken()
    if (fresh) return api<T>(path, options, false)
  }

  const data = await parse(res)
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }
  return data as T
}

/**
 * Streams a file download through the authenticated API.
 *
 * `window.open` cannot send an Authorization header, so attachment and export
 * bytes have to be fetched and handed to the browser as an object URL.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  let res = await fetch(`${API_BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "include",
  })
  if (res.status === 401) {
    const fresh = await refreshAccessToken()
    if (fresh) {
      res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${fresh}` },
        credentials: "include",
      })
    }
  }
  if (!res.ok) {
    const data = await parse(res)
    throw new ApiError((data as { error?: string }).error ?? "Download failed", res.status)
  }

  const blob = await res.blob()
  const name =
    /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function uploadAttachment(
  documentId: number,
  file: File,
): Promise<{ attachment: { id: number; filename: string } }> {
  const form = new FormData()
  form.append("file", file)

  const send = async (token: string | null) =>
    fetch(`${API_BASE}/api/documents/${documentId}/attachments`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      body: form,
    })

  let res = await send(accessToken)
  if (res.status === 401 && (await refreshAccessToken())) res = await send(accessToken)
  const data = await parse(res)
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? "Upload failed", res.status)
  }
  return data as { attachment: { id: number; filename: string } }
}
