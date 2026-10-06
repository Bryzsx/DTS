import { defineConfig } from "vite"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { sentryVitePlugin } from "@sentry/vite-plugin"

/**
 * DTS web build.
 *
 * The PWA service worker is deliberately conservative: it caches the app shell
 * and previously-read API responses so a reviewer keeps read access to the
 * register when the connection drops, but it never caches anything that
 * requires authentication to fetch by URL (attachment bytes are already served
 * through an authenticated endpoint and are denied by navigateFallbackDenylist).
 */
export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN, // no-op without credentials
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["seal.svg", "offline.html", "fonts/*.woff2"],
      manifest: {
        name: "Document Tracking System",
        short_name: "DTS",
        description: "Document tracking and records management for government offices",
        id: "/",
        lang: "en",
        dir: "ltr",
        scope: "/",
        start_url: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        theme_color: "#0B2545",
        background_color: "#f6f7fb",
        categories: ["productivity", "business"],
        prefer_related_applications: false,
        handle_links: "preferred",
        launch_handler: { client_mode: "navigate-existing" },
        icons: [
          { src: "/seal.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/seal.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{css,ico,png,svg,woff2,html}"],
        navigateFallback: "index.html",
        // Never let the service worker answer an API call: a stale or wrong
        // document list served from cache would be worse than an error.
        navigateFallbackDenylist: [/^\/api\//, /\/attachments\//, /\/export\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|woff2)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "dts-assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Read-only document queries survive a dropped connection briefly so
            // a reviewer keeps the register on screen while offline.
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === "GET" && url.pathname.startsWith("/api/documents"),
            handler: "NetworkFirst",
            options: {
              cacheName: "dts-documents",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "dts-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 40, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/uploads": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-router": ["react-router-dom"],
        },
      },
    },
  },
})
