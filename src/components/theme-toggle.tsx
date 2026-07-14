"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["light", "dark", "system"];

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Cycles light → dark → system; persists in localStorage. */
export function ThemeToggle({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "select";
}) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && ORDER.includes(stored)) setTheme(stored);
  }, []);

  useEffect(() => {
    apply(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => theme === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  const onClick = () => {
    localStorage.setItem("theme", next);
    setTheme(next);
  };

  if (variant === "select") {
    return (
      <select
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-clinic focus:outline-none"
        value={theme}
        onChange={(e) => {
          const value = e.target.value as Theme;
          localStorage.setItem("theme", value);
          setTheme(value);
        }}
        aria-label="Theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink"
      title={`Theme: ${theme} — click for ${next}`}
    >
      <Icon size={18} strokeWidth={2} className="shrink-0" />
      <span className="hidden capitalize md:block">{theme} theme</span>
    </button>
  );
}
