"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import clsx from "clsx";

export interface Option {
  id: string;
  value: string;
}

/** Ids may arrive as numbers or padded strings depending on the source. */
const sameId = (a: string | number, b: string | number) =>
  String(a).trim() === String(b).trim();

/** Drops entries whose id already appeared — a selection can never duplicate. */
export function dedupeOptions(list: Option[]): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const option of list) {
    const key = String(option.id).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

/**
 * Searchable multi-select for the Medicover dictionaries (regions, clinics,
 * doctors…). Type to filter, click or Enter to toggle, chips show selection.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  disabled,
  loading,
  single = false,
}: {
  options: Option[];
  selected: Option[];
  onChange: (next: Option[]) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Defensive: never render or hand back duplicated entries, whatever the
  // parent state got seeded with (env vars, stored defaults, races…).
  const safeSelected = useMemo(() => dedupeOptions(selected), [selected]);
  const safeOptions = useMemo(() => dedupeOptions(options), [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pl");
    const base = q
      ? safeOptions.filter((o) => o.value.toLocaleLowerCase("pl").includes(q))
      : safeOptions;
    return base.slice(0, 250);
  }, [safeOptions, query]);

  const toggle = (option: Option) => {
    const isSelected = safeSelected.some((s) => sameId(s.id, option.id));
    if (single) {
      onChange(isSelected ? [] : [option]);
      setOpen(false);
      return;
    }
    onChange(
      isSelected
        ? safeSelected.filter((s) => !sameId(s.id, option.id))
        : dedupeOptions([...safeSelected, option]),
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm",
          disabled ? "cursor-not-allowed opacity-50" : "hover:border-clinic",
          open && "border-clinic",
        )}
      >
        <span className={clsx("truncate", !safeSelected.length && "text-ink-soft/70")}>
          {safeSelected.length
            ? safeSelected.map((s) => s.value).join(", ")
            : loading
              ? "Loading…"
              : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-ink-soft" />
      </button>

      {safeSelected.length > 1 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {safeSelected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-md bg-clinic-wash px-2 py-0.5 text-xs font-medium text-clinic-deep"
            >
              {s.value}
              <button
                type="button"
                aria-label={`Remove ${s.value}`}
                onClick={() => toggle(s)}
                className="rounded hover:bg-white/60"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className="w-full border-b border-line px-3 py-2 text-sm focus:outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-soft">
                {loading ? "Loading…" : "No matches"}
              </li>
            ) : (
              filtered.map((option) => {
                const isSelected = safeSelected.some((s) => sameId(s.id, option.id));
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => toggle(option)}
                      className={clsx(
                        "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-paper",
                        isSelected && "text-clinic-deep",
                      )}
                    >
                      <span className="truncate">{option.value}</span>
                      {isSelected ? <Check size={14} className="shrink-0" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
