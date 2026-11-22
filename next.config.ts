import type { NextConfig } from "next";
import { buildSecurityHeaders } from "@/lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
};

export default Object.assign(nextConfig, {
  async headers() {
    return buildSecurityHeaders(true); // report-only initially
  },
});
