import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin workspace root so Turbopack does not pick up parent lockfiles
  turbopack: {
    root: path.join(__dirname),
  },

  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 1000,
    unoptimized: false,
  },

  // Headers for performance
  async headers() {
    return [
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  async rewrites() {
    return [
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
