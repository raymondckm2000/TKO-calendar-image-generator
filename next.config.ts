import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical", "rrule-temporal", "temporal-polyfill"],
};

export default nextConfig;
