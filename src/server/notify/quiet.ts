/** Quiet-hours logic (pure). During quiet hours notifications still go out,
 * but capped at a silent priority so nobody gets woken up. */

export function parseQuietHours(range: string): { start: number; end: number } | null {
  const m = range.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start > 23 || end > 24 || start === end) return null;
  return { start, end };
}

/** Is `hour` inside the range? Ranges may wrap midnight ("23-7"). */
export function isQuietHour(hour: number, range: string): boolean {
  const parsed = parseQuietHours(range);
  if (!parsed) return false;
  const { start, end } = parsed;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Silent-delivery cap applied to any channel's priority during quiet hours. */
export const QUIET_PRIORITY_CAP = -1;
