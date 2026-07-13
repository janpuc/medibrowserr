"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, Card } from "@/components/ui";

/** Styled replacement for window.confirm — used for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <Card className="stamp-in w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-alert-wash text-alert">
            <TriangleAlert size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="border-alert bg-alert text-white hover:bg-alert hover:opacity-90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Bottom-right auto-dismissing note — styled replacement for alert(). */
export function Toast({
  message,
  onDone,
  tone = "neutral",
}: {
  message: string | null;
  onDone: () => void;
  tone?: "neutral" | "found" | "alert";
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div className="fixed right-5 bottom-5 z-50">
      <Card
        className={`stamp-in max-w-sm px-4 py-3 text-sm ${
          tone === "found"
            ? "border-found"
            : tone === "alert"
              ? "border-alert"
              : ""
        }`}
      >
        {message}
      </Card>
    </div>
  );
}
