/**
 * Pre-flight: bundle api/index.ts the way Vercel's Node runtime would, to prove
 * the `.js` -> `.ts` import resolution and Node compatibility hold before deploy.
 */
import { build } from "esbuild"
import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"

const outdir = resolve(import.meta.dir, "..", ".vercel-buildcheck")
rmSync(outdir, { recursive: true, force: true })

const result = await build({
  entryPoints: [resolve(import.meta.dir, "..", "api", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: resolve(outdir, "function.mjs"),
  // Vercel externalises these at runtime; PGlite is deliberately NOT external
  // so the artifact is self-contained and can actually be invoked here.
  external: ["@sentry/node", "postgres"],
  logLevel: "info",
  metafile: true,
})

const failures = result.errors.length
console.log(`\nbundle errors: ${failures}`)

if (failures === 0 && existsSync(resolve(outdir, "function.mjs"))) {
  console.log("OK: api/index.ts bundled for the Node runtime")

  // Load the bundle the way Vercel will, and prove the default export is callable.
  const mod = await import(`file:///${resolve(outdir, "function.mjs").replace(/\\/g, "/")}`)
  const handler = mod.default
  console.log(`default export type: ${typeof handler}`)
  if (typeof handler !== "function") {
    console.log("FAIL: default export is not a callable Request -> Response handler")
    process.exitCode = 1
  } else {
    const res = await handler(new Request("http://localhost/api/health"))
    console.log(`invoked handler -> ${res.status} ${await res.clone().text()}`)
  }
}

rmSync(outdir, { recursive: true, force: true })