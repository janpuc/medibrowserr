import "server-only";
import { and, eq, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { autoSeedIfStale } from "@/server/coverage/seeder";
import { getDb, schema } from "@/server/db";
import { runMonitor } from "./engine";

const TICK_MS = 30_000;
const CLEANUP_EVERY_MS = 24 * 3600 * 1000;
const RETENTION_MS = 90 * 24 * 3600 * 1000;

type GlobalWithScheduler = typeof globalThis & {
  __medibrowserrScheduler?: {
    timer: ReturnType<typeof setInterval>;
    running: boolean;
    lastCleanupAt?: number;
  };
};

/**
 * In-process scheduler, started once from instrumentation.ts. Monitors keep
 * their own nextRunAt in SQLite, so restarts pick up where they left off.
 */
export function startScheduler(): void {
  const g = globalThis as GlobalWithScheduler;
  if (g.__medibrowserrScheduler) return;
  const state: NonNullable<GlobalWithScheduler["__medibrowserrScheduler"]> = {
    running: false,
    timer: setInterval(() => void tick(), TICK_MS),
  };
  g.__medibrowserrScheduler = state;
  console.log("[scheduler] started, tick every", TICK_MS / 1000, "s");

  async function tick(): Promise<void> {
    if (state.running) return; // don't overlap slow runs
    state.running = true;
    try {
      // Keep the local coverage index fresh (no-op unless connected & stale).
      await autoSeedIfStale().catch(() => {});
      const db = await getDb();

      // Daily retention: gone slots and notification logs older than 90 days.
      const now = Date.now();
      if (!state.lastCleanupAt || now - state.lastCleanupAt > CLEANUP_EVERY_MS) {
        state.lastCleanupAt = now;
        await db
          .delete(schema.foundSlots)
          .where(
            and(
              isNotNull(schema.foundSlots.goneAt),
              lt(schema.foundSlots.goneAt, now - RETENTION_MS),
            ),
          );
        await db
          .delete(schema.notifications)
          .where(lt(schema.notifications.sentAt, now - RETENTION_MS));
      }
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
