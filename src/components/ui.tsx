import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {lead ? <p className="mt-1.5 max-w-xl text-sm text-ink-soft">{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-line bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variant === "primary" && "bg-clinic text-white hover:bg-clinic-hover",
        variant === "secondary" &&
          "border border-line bg-surface text-ink hover:border-clinic hover:text-clinic-deep",
        variant === "ghost" && "text-ink-soft hover:bg-paper hover:text-ink",
        variant === "danger" && "border border-line text-alert hover:bg-alert-wash",
        className,
      )}
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "found" | "alert" | "amber" | "clinic";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium",
        tone === "neutral" && "bg-paper text-ink-soft",
        tone === "found" && "bg-found-wash text-found",
        tone === "alert" && "bg-alert-wash text-alert",
        tone === "amber" && "bg-amber-wash text-amber",
        tone === "clinic" && "bg-clinic-wash text-clinic-deep",
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-clinic focus:outline-none";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-clinic",
        className,
      )}
      aria-label="Loading"
    />
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="px-8 py-12 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-soft">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Card>
  );
}
