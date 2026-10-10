"use client";

import { useSyncExternalStore } from "react";
import {
  currentVoice,
  getChosenVoice,
  getLastSpeechFailure,
  getSpeechSpeed,
  getVoiceList,
  onSpeechChange,
  type SpeechFailure,
  type SpeechSpeed,
} from "@/lib/speak";

const NO_VOICES: SpeechSynthesisVoice[] = [];

/**
 * The speech preferences and this device's voices, for Settings. Behind
 * useSyncExternalStore so the server render and the first client render agree,
 * and the voice list fills in when the browser finishes loading it.
 */
export function useSpeechPrefs(): {
  voices: SpeechSynthesisVoice[];
  chosen: string | null;
  speaking: SpeechSynthesisVoice | undefined;
  speed: SpeechSpeed;
  failure: SpeechFailure | null;
} {
  const voices = useSyncExternalStore(onSpeechChange, getVoiceList, () => NO_VOICES);
  const chosen = useSyncExternalStore(onSpeechChange, getChosenVoice, () => null);
  const speaking = useSyncExternalStore(onSpeechChange, currentVoice, () => undefined);
  const speed = useSyncExternalStore(onSpeechChange, getSpeechSpeed, () => "relaxed" as const);
  const failure = useSyncExternalStore(onSpeechChange, getLastSpeechFailure, () => null);
  return { voices, chosen, speaking, speed, failure };
}
