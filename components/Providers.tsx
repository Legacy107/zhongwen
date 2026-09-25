"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { AudioUnlock } from "./AudioUnlock";
import { SyncProvider } from "./SyncProvider";
import { TabBar } from "./ui/TabBar";

/**
 * Client-side app shell: background sync, the first-tap audio unlock, the
 * tab bar on hub screens, and reduced motion honoured everywhere motion is
 * used (the OS setting, not a per-component check).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SyncProvider />
      <AudioUnlock />
      {children}
      <TabBar />
    </MotionConfig>
  );
}
