import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin workspace root so Turbopack does not pick up parent lockfiles
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/pay",
        destination: "/pay.html",
      },
      {
        source: "/admin/manifest.webmanifest",
        destination: "/api/manifest/admin",
      },
      {
        source: "/field/manifest.webmanifest",
        destination: "/api/manifest/field",
      },
    ];
  },
  // Allow local network IP for HMR
  allowedDevOrigins: ['192.168.0.125', 'localhost'],
};

export default withSentryConfig(nextConfig, {
  // Sentry Webpack Plugin options — suppress verbose build output
  silent: true,
  // Upload source maps only when SENTRY_AUTH_TOKEN is set (CI/production)
  // Set SENTRY_ORG and SENTRY_PROJECT env vars before deploying
  org: process.env.SENTRY_ORG || "",
  project: process.env.SENTRY_PROJECT || "",
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
