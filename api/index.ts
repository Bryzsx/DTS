/**
 * Vercel serverless entrypoint.
 *
 * Vercel discovers this file for the Node.js runtime and serves it as
 * `/api/*`. In development the same app runs from `apps/api/src/index.ts`,
 * so the two paths must stay in step.
 *
 * Uses Hono's Vercel adapter which exports named HTTP method handlers
 * (GET, POST, PUT, PATCH, DELETE, etc.) that Vercel's Node.js runtime expects.
 */
import { handle } from "hono/vercel"
import app from "../apps/api/src/index.js"

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
export const OPTIONS = handle(app)
export const HEAD = handle(app)