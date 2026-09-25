import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: lets a phone on the same Wi-Fi load the dev server's JS, which
  // Next blocks for any hostname other than localhost. No effect in production.
  allowedDevOrigins: ["192.168.1.100"],
};

export default withSerwist(nextConfig);
