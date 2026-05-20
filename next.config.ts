import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/extract": [
      "./node_modules/node-ical/**/*",
      "./node_modules/rrule-temporal/**/*",
      "./node_modules/temporal-polyfill/**/*",
    ],
  },
  serverExternalPackages: ["node-ical", "rrule-temporal", "temporal-polyfill"],
};

export default nextConfig;
