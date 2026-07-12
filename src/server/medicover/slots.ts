import type { Slot, SlotSearchParams } from "./types";

/** Client-side refinements the API can't express: end date + hour window. */
export function filterSlots(slots: Slot[], p: SlotSearchParams): Slot[] {
  return slots
    .filter((s) => {
      const date = s.appointmentDate?.slice(0, 10);
      if (!date) return false;
      if (p.endDate && date > p.endDate) return false;
      const hour = Number(s.appointmentDate.slice(11, 13));
      if (p.startHour !== undefined && p.startHour !== null && hour < p.startHour) return false;
      if (p.endHour !== undefined && p.endHour !== null && hour >= p.endHour) return false;
      return true;
    })
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
}

export function isoToday(): string {
  // Poland-local "today" regardless of server TZ.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Applies the free-text doctor-name filter (covers doctors not in the picker). */
export function applyDoctorNameFilter(slots: Slot[], filter: string | null | undefined): Slot[] {
  const needle = filter?.trim().toLocaleLowerCase("pl");
  if (!needle) return slots;
  return slots.filter((s) => s.doctor?.name?.toLocaleLowerCase("pl").includes(needle));
}
