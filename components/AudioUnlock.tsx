"use client";

import { useEffect } from "react";
import { unlockAudio } from "@/lib/sound";
import { warmUpSpeech } from "@/lib/speak";

/**
 * iOS starts an AudioContext only inside a user gesture, and loads speech
 * voices lazily. One listener on the first touch anywhere does both, so no
 * individual button has to remember to.
 */
export function AudioUnlock() {
  useEffect(() => {
    warmUpSpeech();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}
