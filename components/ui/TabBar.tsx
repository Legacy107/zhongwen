"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Learn", icon: "home" },
  { href: "/read", label: "Read", icon: "book" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** Hub screens get the tab bar; sessions are full-screen and leave by their X. */
export const TAB_ROUTES = new Set(TABS.map((t) => t.href));

export function TabBar() {
  const pathname = usePathname();
  if (!TAB_ROUTES.has(pathname)) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="group flex flex-col items-center gap-0.5 py-2"
              >
                <span
                  className={`grid h-9 w-14 place-items-center rounded-xl border-2 transition-colors ${
                    active
                      ? "border-blue/60 bg-blue-soft text-blue"
                      : "border-transparent text-ink-3 group-active:bg-surface-2"
                  }`}
                >
                  <Icon name={tab.icon} size={24} strokeWidth={active ? 3 : 2.5} />
                </span>
                <span
                  className={`text-[11px] font-bold tracking-wide ${active ? "text-blue" : "text-ink-3"}`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
