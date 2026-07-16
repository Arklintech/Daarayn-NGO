import type { NextConfig } from "next";
import path from "path";

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
    ];
  },
};

export default nextConfig;

