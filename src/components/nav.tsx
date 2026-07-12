"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarSearch, ShieldCheck, Settings } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/", label: "Monitors", icon: Activity },
  { href: "/appointments", label: "Appointments", icon: CalendarSearch },
  { href: "/coverage", label: "Coverage", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-line bg-surface sm:w-56">
      <Link href="/" className="flex items-center gap-2.5 px-4 py-6 sm:px-6">
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
        <span className="hidden font-display text-lg font-semibold tracking-tight sm:block">
          medibrowserr
        </span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 px-2 sm:px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
              <span className="hidden sm:block">{label}</span>
            </Link>
          );
        })}
      </nav>
      <p className="hidden px-6 pb-6 font-mono text-[11px] text-ink-soft sm:block">
        watching Medicover
        <br />
        so you don&apos;t have to
      </p>
    </aside>
  );
}
