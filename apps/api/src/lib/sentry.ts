import * as Sentry from "@sentry/node"

const dsn = process.env.SENTRY_DSN

if (dsn && process.env.NODE_ENV === "production") {
  Sentry.init({
    // @ts-expect-error - Sentry types lag behind SDK; dsn is valid at runtime
    dsn,
    environment: "production",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.cookies) {
        delete event.request.cookies
      }
      return event
    },
  })
}
