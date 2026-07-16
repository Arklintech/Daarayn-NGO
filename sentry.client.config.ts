import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Get your DSN from https://sentry.io → Project Settings → Client Keys
  // Set NEXT_PUBLIC_SENTRY_DSN in your .env.local file
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable Sentry in production — don't track local dev errors
  enabled: process.env.NODE_ENV === "production",

  // Capture 10% of performance traces (increase once stable)
  tracesSampleRate: 0.1,

  // Release name for linking errors to deployments
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // Tags to identify the platform context in Sentry
  initialScope: {
    tags: {
      platform: "daarayn",
      portal: "web",
    },
  },
});
