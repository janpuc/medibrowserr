"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarSearch, ShieldCheck, Settings } from "lucide-react";
import clsx from "clsx";
import { ThemeToggle } from "@/components/theme-toggle";

const items = [
  { href: "/", label: "Monitors", icon: Activity },
  { href: "/appointments", label: "Appointments", icon: CalendarSearch },
  { href: "/coverage", label: "Coverage", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** lucide dropped brand icons; minimal GitHub mark for the repo link. */
export function GithubMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/** Desktop / tablet: the left rail. Hidden on phones (bottom tabs instead). */
export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-line bg-surface sm:flex md:w-56">
      <Link href="/" className="flex items-center gap-2.5 px-4 py-6 md:px-6">
        {/* Crosshair-cross mark: the hunt, drawn like a clinic cross. */}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-clinic text-white">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path
              d="M9 2v5M9 11v5M2 9h5M11 9h5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="9" cy="9" r="1.6" fill="currentColor" />
          </svg>
        </span>
        <span className="hidden font-display text-lg font-semibold tracking-tight md:block">
          medibrowserr
        </span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 px-2 md:px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-clinic-wash text-clinic-deep"
                  : "text-ink-soft hover:bg-paper hover:text-ink",
              )}
            >
              <Icon size={18} strokeWidth={2} className="shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-2 pb-3 md:px-3">
        <ThemeToggle />
      </div>
      <div className="hidden px-6 pb-6 md:block">
        <p className="font-mono text-[11px] text-ink-soft">
          watching Medicover
          <br />
          so you don&apos;t have to
        </p>
        <a
          href="https://github.com/janpuc/medibrowserr"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-ink-soft hover:text-clinic"
        >
          <GithubMark size={11} /> janpuc/medibrowserr
        </a>
      </div>
    </aside>
  );
}

/** Phones: native-app-style bottom tabs, thumb-reachable. */
export function MobileTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="flex items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-clinic-deep" : "text-ink-soft",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
        <ThemeToggle variant="tab" />
      </div>
    </nav>
  );
}
