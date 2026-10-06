/**
 * Vercel serverless entrypoint.
 *
 * Vercel discovers this file for the Node.js runtime and serves it as
 * `/api/*`. In development the same app runs from `apps/api/src/index.ts`,
 * so the two paths must stay in step.
 *
 * The default export must be a callable `Request -> Response` handler, which is
 * the same shape Hono's own Vercel adapter produces. Exporting the Hono instance
 * directly would hand Vercel an object rather than a handler.
 */
import app from "../apps/api/src/index.js"

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request)
}
