import * as Sentry from "@sentry/node"

const dsn = process.env.SENTRY_DSN

if (dsn && process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn,
    environment: "production",
    tracesSampleRate: 0.1, // 10% of transactions for performance
    beforeSend(event) {
      // Strip sensitive data before sending
      if (event.request?.cookies) {
        delete event.request.cookies
      }
      return event
    },
  })
}
