"use client";

import { formatSlotDate, type FoundSlotRow } from "@/lib/client";
import { Badge } from "@/components/ui";

/**
 * A found slot rendered as a waiting-room ticket: perforated edge and a
 * monospace time stub, like the number slips at the rejestracja desk.
 */
export function SlotTicket({ row }: { row: FoundSlotRow }) {
  const { slot, monitorName } = row;
  const [datePart, timePart] = formatSlotDate(slot.appointmentDate).split(" ");
  const isNew = Date.now() - slot.firstSeenAt < 24 * 3600 * 1000;
  const initials =
    slot.doctorName
      ?.split(" ")
      .filter(Boolean)
      .slice(-2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() ?? "?";

  return (
    <div className="stamp-in flex overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {/* Perforated time stub */}
      <div className="ticket-edge relative flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed border-line bg-clinic-wash px-2 py-4">
        <span className="font-mono text-lg font-medium text-clinic-deep">{timePart}</span>
        <span className="mt-0.5 font-mono text-[11px] text-ink-soft">{datePart}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper font-display text-sm font-semibold text-ink-soft">
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
          {isNew ? <Badge tone="found">NEW</Badge> : null}
          {monitorName ? <Badge tone="neutral">{monitorName}</Badge> : null}
        </div>
      </div>
    </div>
  );
}
