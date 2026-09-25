"use client";

import { useEffect } from "react";
import { unlockAudio } from "@/lib/sound";
import { unlockSpeech, warmUpSpeech } from "@/lib/speak";

/**
 * iOS starts an AudioContext only inside a user gesture, and allows speech
 * only after a first utterance from one. One listener on the first touch
 * anywhere does both, so no individual button has to remember to.
 */
export function AudioUnlock() {
  useEffect(() => {
    warmUpSpeech();
    const unlock = () => {
      unlockAudio();
      unlockSpeech();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}
