import { spawnSync } from "node:child_process";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Dev-only: lets a phone on the same Wi-Fi load the dev server's JS, which
  // Next blocks for any hostname other than localhost. 127.0.0.1 is a separate
  // origin with its own IndexedDB, used to test without touching real progress.
  // No effect in production.
  allowedDevOrigins: ["192.168.1.100", "127.0.0.1"],
  // The dev-mode badge sits over the bottom-left buttons on a phone. Compile
  // and runtime errors still show without it.
  devIndicators: false,
  // The build, for Settings to show: the release in package.json, the commit
  // it was built from, and when. Inlined into the bundle at build time.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_COMMIT: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ?? "",
    NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
  },
};

export default withSerwist(nextConfig);
