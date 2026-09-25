"use client";

import { useCallback } from "react";
import { setSfxEnabled } from "./sound";
import { useAutoSpeak } from "./useAutoSpeak";
import { useStoredToggle } from "./useStoredToggle";

/**
 * One switch for all of a session's sound. A speaker icon reads as "all
 * audio", so muting it and still hearing chimes felt broken. Settings keeps
 * the two apart (speech vs effects) for anyone who wants only one.
 */
export function useSound(): { speech: boolean; any: boolean; setAll: (on: boolean) => void } {
  const [speech, setSpeech] = useAutoSpeak();
  // Same key and "1"/"0" format lib/sound reads.
  const [sfx, setSfx] = useStoredToggle("sfxEnabled", true);
  const setAll = useCallback(
    (on: boolean) => {
      setSpeech(on);
      setSfx(on);
      setSfxEnabled(on);
    },
    [setSpeech, setSfx],
  );
  return { speech, any: speech || sfx, setAll };
}
