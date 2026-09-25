"use client";

import { motion } from "motion/react";

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  /** 0..1, drawn lighter beyond `value`: e.g. words started but not yet known. */
  secondary?: number;
  /** Tailwind background class for the fill. */
  color?: string;
  height?: number;
  className?: string;
  label?: string;
}

/**
 * A chunky progress bar with a highlight stripe along the top of the fill,
 * which is what makes it read as a physical, glossy object rather than a
 * thin line. The fill springs to its new width.
 */
export function ProgressBar({ value, secondary, color = "bg-green", height = 16, className = "", label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const extra = secondary ? Math.max(0, Math.min(1, value + secondary)) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`relative overflow-hidden rounded-full bg-surface-3 ${className}`}
      style={{ height }}
    >
      {extra > pct && (
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full ${color} opacity-35`}
          initial={false}
          animate={{ width: `${extra}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
          style={{ minWidth: height }}
        />
      )}
      <motion.div
        className={`absolute inset-y-0 left-0 rounded-full ${color}`}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
        style={{ minWidth: pct > 0 ? height : 0 }}
      >
        <span
          className="absolute left-2 right-2 rounded-full bg-white/35"
          style={{ top: height * 0.22, height: Math.max(3, height * 0.22) }}
        />
      </motion.div>
    </div>
  );
}
