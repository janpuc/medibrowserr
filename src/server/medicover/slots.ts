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

/** Poland-local "now" in the API's own format — safe to string-compare. */
export function nowWarsawIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export interface ActiveSlotRow {
  dedupeKey: string;
  appointmentDate: string;
}

/**
 * Splits previously-active slots that vanished from the current sweep:
 * future-dated ones were taken by someone (worth a heads-up), past-dated
 * ones simply expired (silent bookkeeping).
 */
export function splitGoneCandidates<T extends ActiveSlotRow>(
  activeRows: T[],
  currentKeys: Set<string>,
  nowIso: string,
): { taken: T[]; expired: T[] } {
  const taken: T[] = [];
  const expired: T[] = [];
  for (const row of activeRows) {
    if (currentKeys.has(row.dedupeKey)) continue;
    (row.appointmentDate > nowIso ? taken : expired).push(row);
  }
  return { taken, expired };
}

/** Applies the free-text doctor-name filter (covers doctors not in the picker). */
export function applyDoctorNameFilter(slots: Slot[], filter: string | null | undefined): Slot[] {
  const needle = filter?.trim().toLocaleLowerCase("pl");
  if (!needle) return slots;
  return slots.filter((s) => s.doctor?.name?.toLocaleLowerCase("pl").includes(needle));
}
