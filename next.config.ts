import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: lets a phone on the same Wi-Fi load the dev server's JS, which
  // Next blocks for any hostname other than localhost. 127.0.0.1 is a separate
  // origin with its own IndexedDB, used to test without touching real progress.
  // No effect in production.
  allowedDevOrigins: ["192.168.1.100", "127.0.0.1"],
  // The dev-mode badge sits over the bottom-left buttons on a phone. Compile
  // and runtime errors still show without it.
  devIndicators: false,
};

export default withSerwist(nextConfig);
