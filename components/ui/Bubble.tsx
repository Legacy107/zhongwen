import type { ReactNode } from "react";
import { Mascot, type Mood } from "./Mascot";

/**
 * The cat saying the prompt, Duolingo-style: character on the left, speech
 * bubble on the right with a tail pointing back at it.
 */
export function MascotBubble({
  mood = "think",
  children,
  size = 84,
}: {
  mood?: Mood;
  children: ReactNode;
  size?: number;
}) {
  return (
    <div className="flex items-end gap-2">
      <Mascot mood={mood} size={size} className="shrink-0" />
      <div className="relative mb-4 min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-3">
        {/* tail: a rotated square sharing the bubble's border */}
        <span
          aria-hidden
          className="absolute -left-[9px] bottom-4 size-4 rotate-45 border-b-2 border-l-2 border-line bg-surface"
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
