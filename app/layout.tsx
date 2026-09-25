import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import { THEME_SCRIPT } from "@/lib/themeScript";
import "./globals.css";

/**
 * Baloo 2: rounded, heavy and friendly, and one of the few such faces with
 * every tone-marked vowel pinyin needs (ǐ ǒ ǖ ǘ ǚ ǜ included), so a syllable
 * never falls back to another font mid-word.
 *
 * Subset from the upstream TTF (Latin, Latin Extended, Vietnamese, combining
 * marks) rather than loaded from Google Fonts: Google's split latin-ext
 * subset draws the macron of ā ē ī ō ū detached, beside the letter, which
 * broke every first-tone syllable. Licence: app/fonts/OFL.txt.
 */
const baloo = localFont({
  src: "./fonts/Baloo2-latin-vi.woff2",
  weight: "400 800",
  display: "swap",
  variable: "--font-baloo",
});

export const metadata: Metadata = {
  applicationName: "HánViệt",
  title: "Hán Việt — Chinese for Vietnamese speakers",
  description: "Learn Mandarin through Sino-Vietnamese cognates. Spaced repetition, tones, reading.",
  // "default" keeps dark status-bar glyphs over a light page. Translucent
  // forces white glyphs, which vanish on the light theme.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "HánViệt" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111b21" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets data-theme before hydration, so React must not
    // treat the attribute as a mismatch.
    <html lang="en" className={`${baloo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">
          <Providers>{children}</Providers>
        </SerwistProvider>
      </body>
    </html>
  );
}
