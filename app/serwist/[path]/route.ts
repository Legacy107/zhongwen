import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/** Ties the precache to the commit so a deploy invalidates stale pages. */
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
    // words.json is ~2.4MB and is the deck itself. Without raising this it is
    // silently skipped and offline review has no cards.
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  });
