import "server-only";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { runMonitor } from "./engine";

const TICK_MS = 30_000;

type GlobalWithScheduler = typeof globalThis & {
  __medibrowserrScheduler?: { timer: ReturnType<typeof setInterval>; running: boolean };
};

/**
 * In-process scheduler, started once from instrumentation.ts. Monitors keep
 * their own nextRunAt in SQLite, so restarts pick up where they left off.
 */
export function startScheduler(): void {
  const g = globalThis as GlobalWithScheduler;
  if (g.__medibrowserrScheduler) return;
  const state = { running: false, timer: setInterval(() => void tick(), TICK_MS) };
  g.__medibrowserrScheduler = state;
  console.log("[scheduler] started, tick every", TICK_MS / 1000, "s");

  async function tick(): Promise<void> {
    if (state.running) return; // don't overlap slow runs
    state.running = true;
    try {
      const db = await getDb();
      const due = await db
        .select()
        .from(schema.monitors)
        .where(
          and(
            eq(schema.monitors.active, true),
            or(isNull(schema.monitors.nextRunAt), lte(schema.monitors.nextRunAt, Date.now())),
          ),
        );
      for (const monitor of due) {
        try {
          const result = await runMonitor(monitor);
          if (result.newSlots.length) {
            console.log(
              `[scheduler] monitor #${monitor.id} "${monitor.name}": ${result.newSlots.length} new slot(s)` +
                (result.notified ? ", notified" : ""),
            );
          }
        } catch (err) {
          console.warn(
            `[scheduler] monitor #${monitor.id} "${monitor.name}" failed:`,
            err instanceof Error ? err.message : err,
          );
        }
        // Small gap between monitors to stay gentle on the API.
        await new Promise((r) => setTimeout(r, 2_000));
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    } finally {
      state.running = false;
    }
  }
}
