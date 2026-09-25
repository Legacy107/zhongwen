"use client";

import { motion, useReducedMotion, type TargetAndTransition } from "motion/react";

/**
 * Mèo, the app's cat.
 *
 * A cat because the Vietnamese zodiac has the Cat (Mão) where the Chinese one
 * has the Rabbit: the same calendar, one animal apart, which is the whole
 * Hán-Việt bridge in miniature.
 *
 * Moods map to moments: `happy` idles on hubs, `cheer` celebrates a correct
 * answer or a finished session, `sad` softens a wrong answer, `think` sits
 * beside a prompt.
 */
export type Mood = "happy" | "cheer" | "sad" | "think" | "sleep";

const FUR = "#FF9F43";
const FUR_DARK = "#E97F1C";
const MUZZLE = "#FFE9D2";
const EAR = "#FFB3A6";
const NOSE = "#FF6F86";
const INK = "#2E2A33";
const LINE = "#7A4A22";

function Eyes({ mood }: { mood: Mood }) {
  if (mood === "happy" || mood === "cheer") {
    return (
      <g fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round">
        <path d="M38 63q7-8 14 0" />
        <path d="M68 63q7-8 14 0" />
      </g>
    );
  }
  if (mood === "sleep") {
    return (
      <g fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round">
        <path d="M38 61q7 6 14 0" />
        <path d="M68 61q7 6 14 0" />
      </g>
    );
  }
  const look = mood === "think" ? { x: 2, y: -3 } : mood === "sad" ? { x: 0, y: 2 } : { x: 0, y: 0 };
  return (
    <g>
      <ellipse cx={45} cy={61} rx={6} ry={7.5} fill={INK} />
      <ellipse cx={75} cy={61} rx={6} ry={7.5} fill={INK} />
      <circle cx={47 + look.x} cy={58 + look.y} r={2.3} fill="#fff" />
      <circle cx={77 + look.x} cy={58 + look.y} r={2.3} fill="#fff" />
      {mood === "sad" && (
        // Inner ends raised: worried, not cross. Lowered inner ends read as anger.
        <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
          <path d="M37 52l11-4" />
          <path d="M83 52l-11-4" />
        </g>
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === "cheer") {
    return (
      <g>
        <path d="M51 79q9 13 18 0z" fill="#7A2E3A" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        <path d="M55 84q5 4 10 0" fill={NOSE} />
      </g>
    );
  }
  if (mood === "sad") {
    return <path d="M53 86q7-6 14 0" fill="none" stroke={LINE} strokeWidth={2.5} strokeLinecap="round" />;
  }
  if (mood === "think") {
    return <ellipse cx={62} cy={83} rx={3} ry={2.5} fill={LINE} />;
  }
  return (
    <path
      d="M60 77v3.5M60 80.5q-4.5 4.5-9 0M60 80.5q4.5 4.5 9 0"
      fill="none"
      stroke={LINE}
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  );
}

export function MascotFace({ mood = "happy" }: { mood?: Mood }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
      {/* ears */}
      <path d="M22 52 26 17q1-6 6-3l24 17z" fill={FUR} stroke={FUR_DARK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M98 52 94 17q-1-6-6-3L64 31z" fill={FUR} stroke={FUR_DARK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M29 41 31 23l14 10z" fill={EAR} />
      <path d="M91 41 89 23 75 33z" fill={EAR} />
      {/* head */}
      <path
        d="M60 25c27 0 46 17 46 42 0 23-20 38-46 38S14 90 14 67c0-25 19-42 46-42z"
        fill={FUR}
        stroke={FUR_DARK}
        strokeWidth={2}
      />
      {/* forehead stripes */}
      <g stroke={FUR_DARK} strokeWidth={4} strokeLinecap="round">
        <path d="M51 32l2 8" />
        <path d="M60 30v9" />
        <path d="M69 32l-2 8" />
      </g>
      <ellipse cx={60} cy={82} rx={21} ry={15} fill={MUZZLE} />
      {/* blush */}
      <ellipse cx={33} cy={77} rx={7} ry={4} fill="#FF8FA3" opacity={0.45} />
      <ellipse cx={87} cy={77} rx={7} ry={4} fill="#FF8FA3" opacity={0.45} />
      <Eyes mood={mood} />
      <path d="M55.5 73h9l-4.5 5z" fill={NOSE} stroke={NOSE} strokeWidth={2} strokeLinejoin="round" />
      <Mouth mood={mood} />
      {/* whiskers */}
      <g stroke={LINE} strokeWidth={1.8} strokeLinecap="round" opacity={0.55}>
        <path d="M17 76l16 2" />
        <path d="M18 85l15-3" />
        <path d="M103 76l-16 2" />
        <path d="M102 85l-15-3" />
      </g>
      {mood === "sad" && <path d="M84 66q3 6 0 8.5q-3-2.5 0-8.5z" fill="#6CC6FF" />}
      {mood === "sleep" && (
        <text x={92} y={30} fontSize={16} fontWeight={800} fill="#9AAAB5">
          z
        </text>
      )}
    </svg>
  );
}

const MOTION: Record<Mood, TargetAndTransition> = {
  happy: { y: [0, -3, 0], transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  cheer: { y: [0, -14, 0, -7, 0], rotate: [0, -4, 4, 0], transition: { duration: 0.8 } },
  sad: { rotate: [0, -3, 3, -2, 0], transition: { duration: 0.5 } },
  think: { rotate: [0, 3, 0], transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" } },
  sleep: { scale: [1, 1.02, 1], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
};

export function Mascot({ mood = "happy", size = 96, className }: { mood?: Mood; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={mood}
      className={className}
      style={{ width: size, height: size }}
      animate={reduce ? undefined : MOTION[mood]}
    >
      <MascotFace mood={mood} />
    </motion.div>
  );
}
