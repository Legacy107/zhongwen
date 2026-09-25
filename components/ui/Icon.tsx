/**
 * Inline SVG icons: no icon font or sprite to precache, and they inherit
 * `currentColor` so a button's text colour tints its icon.
 *
 * Drawn on a 24px grid with thick round strokes, to match the chunky
 * buttons. Filled glyphs (flame, star, bolt) set their own fill.
 */
import type { SVGProps } from "react";

const PATHS = {
  home: <path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z" />,
  book: (
    <>
      <path d="M12 6.8C9.8 5.2 6.8 4.6 3.5 5v13.2c3.3-.4 6.3.2 8.5 1.8 2.2-1.6 5.2-2.2 8.5-1.8V5c-3.3-.4-6.3.2-8.5 1.8z" />
      <path d="M12 6.8V20" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20v-6" />
      <path d="M12 20V5" />
      <path d="M19 20v-10" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M15 4.8v4.4" />
      <path d="M4 17h3M11 17h9M9 14.8v4.4" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 7" />,
  speaker: (
    <>
      <path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" fill="currentColor" />
      <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  speakerOff: (
    <>
      <path d="M11 5.5 6.5 9H3.5v6h3l4.5 3.5z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  chevronRight: <path d="M9 5.5 15.5 12 9 18.5" />,
  chevronLeft: <path d="M15 5.5 8.5 12 15 18.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4-.9" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 11A7.5 7.5 0 0 0 6 6.8L4.5 8.5" />
      <path d="M4.5 4.5v4h4" />
      <path d="M4.5 13A7.5 7.5 0 0 0 18 17.2l1.5-1.7" />
      <path d="M19.5 19.5v-4h-4" />
    </>
  ),
  cloud: <path d="M7 18.5h10.5a4 4 0 0 0 .5-8A6 6 0 0 0 6.5 9 4.8 4.8 0 0 0 7 18.5z" />,
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  lightbulb: (
    <>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M8.5 14.5a6 6 0 1 1 7 0c-.7.6-1 1.3-1 2.2V17h-5v-.3c0-.9-.3-1.6-1-2.2z" />
    </>
  ),
  cards: (
    <>
      <rect x="7" y="3.5" width="13" height="15" rx="2.5" />
      <path d="M4 7.5v10a3 3 0 0 0 3 3h9" />
    </>
  ),
  blocks: (
    <>
      <rect x="3.5" y="12.5" width="8" height="8" rx="2" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="2" />
      <rect x="8" y="3.5" width="8" height="8" rx="2" />
    </>
  ),
  wave: <path d="M2.5 12c1.8-5 3.7-5 5.5 0s3.7 5 5.5 0 3.7-5 5.5 0 1.9 3 2.5 3" />,
  swap: (
    <>
      <path d="M4.5 8.5h14M15 5l3.5 3.5L15 12" />
      <path d="M19.5 15.5h-14M9 12l-3.5 3.5L9 19" />
    </>
  ),
  flame: (
    <path
      d="M12 2.5c.6 3.3 4.8 5.7 4.8 10.6a4.8 4.8 0 0 1-9.6 0c0-2.3 1-3.8 2.3-5.2.3 1.6 1 2.7 2.3 3.2-.5-2.9-.2-5.7.2-8.6z"
      fill="currentColor"
      stroke="none"
    />
  ),
  star: (
    <path
      d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"
      fill="currentColor"
      strokeWidth="1.5"
    />
  ),
  bolt: <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" fill="currentColor" strokeWidth="1.5" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17h5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z" fill="currentColor" strokeWidth="1.5" />
      <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" strokeWidth="1" />
    </>
  ),
  bookPlus: (
    <>
      <path d="M12 6.8C9.8 5.2 6.8 4.6 3.5 5v13.2c3.3-.4 6.3.2 8.5 1.8 2.2-1.6 5.2-2.2 8.5-1.8V5c-3.3-.4-6.3.2-8.5 1.8z" />
      <path d="M16 9.5v5M13.5 12h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 19.5H3z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth = 2.5, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
