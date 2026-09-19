import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "HánViệt",
  title: "Hán Việt — Chinese for Vietnamese speakers",
  description:
    "Learn Mandarin through Sino-Vietnamese cognates. Spaced repetition, tones, reading.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "HánViệt" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  // The review screen is thumb-driven; stray double-tap zoom gets in the way.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
