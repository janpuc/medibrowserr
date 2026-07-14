"use client";

import clsx from "clsx";
import { formatSlotDate, type FoundSlotRow } from "@/lib/client";
import { Badge } from "@/components/ui";

/**
 * A found slot rendered as a waiting-room ticket: perforated edge and a
 * monospace time stub. Tickets gray out once the slot is taken or expired.
 */
export function SlotTicket({ row }: { row: FoundSlotRow }) {
  const { slot, monitorName } = row;
  const [datePart, timePart] = formatSlotDate(slot.appointmentDate).split(" ");
  const gone = slot.goneAt !== null;
  const isNew = !gone && Date.now() - slot.firstSeenAt < 24 * 3600 * 1000;
  const initials =
    slot.doctorName
      ?.split(" ")
      .filter(Boolean)
      .slice(-2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() ?? "?";

  return (
    <div
      className={clsx(
        "stamp-in flex overflow-hidden rounded-xl border border-line bg-surface shadow-card",
        gone && "opacity-55 saturate-50",
      )}
    >
      {/* Perforated time stub */}
      <div className="ticket-edge relative flex w-[76px] shrink-0 flex-col items-center justify-center border-r border-dashed border-line bg-clinic-wash px-2 py-4 sm:w-24">
        <span
          className={clsx(
            "font-mono text-lg font-medium text-clinic-deep",
            gone && "line-through decoration-2",
          )}
        >
          {timePart}
        </span>
        <span className="mt-0.5 font-mono text-[11px] text-ink-soft">{datePart}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
        <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-full bg-paper font-display text-sm font-semibold text-ink-soft sm:grid">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{slot.doctorName ?? "Any doctor"}</p>
          <p className="mt-0.5 truncate text-[13px] text-ink-soft">
            {slot.specialtyName}
            {slot.clinicName ? ` · ${slot.clinicName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {gone ? (
            slot.goneReason === "taken" ? (
              <Badge tone="alert">TAKEN</Badge>
            ) : (
              <Badge tone="neutral">EXPIRED</Badge>
            )
          ) : isNew ? (
            <Badge tone="found">NEW</Badge>
          ) : (
            <Badge tone="found">AVAILABLE</Badge>
          )}
          {/* The monitor name is context, not essence — phones drop it. */}
          {monitorName ? (
            <span className="hidden sm:block">
              <Badge tone="neutral">{monitorName}</Badge>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
