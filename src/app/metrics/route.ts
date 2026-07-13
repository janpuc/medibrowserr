import { sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getSeedStatus } from "@/server/coverage/seeder";
import { getMedicoverSession } from "@/server/settings";

export const dynamic = "force-dynamic";

/**
 * Prometheus text exposition at /metrics. When MEDIBROWSERR_BASIC_AUTH is
 * set the endpoint requires it too — use basic_auth in the scrape config.
 */
export async function GET() {
  const db = await getDb();
  const lines: string[] = [];
  const metric = (
    name: string,
    type: "gauge" | "counter",
    help: string,
    values: { labels?: Record<string, string | number>; value: number }[],
  ) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const v of values) {
      const labels = v.labels
        ? `{${Object.entries(v.labels)
            .map(([k, val]) => `${k}="${String(val).replaceAll('"', '\\"')}"`)
            .join(",")}}`
        : "";
      lines.push(`${name}${labels} ${v.value}`);
    }
  };

  metric("medibrowserr_info", "gauge", "Build info", [
    { labels: { version: process.env.MEDIBROWSERR_VERSION || "dev" }, value: 1 },
  ]);

  const session = await getMedicoverSession();
  metric("medibrowserr_medicover_connected", "gauge", "1 when the Medicover session is usable", [
    { value: session.status === "connected" ? 1 : 0 },
  ]);

  const monitors = await db.select().from(schema.monitors);
  metric("medibrowserr_monitors", "gauge", "Configured monitors", [
    { labels: { state: "active" }, value: monitors.filter((m) => m.active).length },
    { labels: { state: "paused" }, value: monitors.filter((m) => !m.active).length },
  ]);
  metric(
    "medibrowserr_monitor_last_run_timestamp_seconds",
    "gauge",
    "Unix time of each monitor's last sweep",
    monitors
      .filter((m) => m.lastRunAt)
      .map((m) => ({ labels: { monitor: m.name, id: m.id }, value: Math.floor(m.lastRunAt! / 1000) })),
  );
  metric(
    "medibrowserr_monitor_last_found",
    "gauge",
    "Slots seen in each monitor's last sweep",
    monitors.map((m) => ({ labels: { monitor: m.name, id: m.id }, value: m.lastFoundCount ?? 0 })),
  );
  metric(
    "medibrowserr_monitor_errors",
    "gauge",
    "1 when the monitor's last sweep failed",
    monitors.map((m) => ({ labels: { monitor: m.name, id: m.id }, value: m.lastStatus === "error" ? 1 : 0 })),
  );

  const [slotCounts] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(case when gone_at is null then 1 else 0 end)`,
      taken: sql<number>`sum(case when gone_reason = 'taken' then 1 else 0 end)`,
      expired: sql<number>`sum(case when gone_reason = 'expired' then 1 else 0 end)`,
    })
    .from(schema.foundSlots);
  metric("medibrowserr_slots", "gauge", "Slot lifecycle counts", [
    { labels: { state: "available" }, value: Number(slotCounts?.active ?? 0) },
    { labels: { state: "taken" }, value: Number(slotCounts?.taken ?? 0) },
    { labels: { state: "expired" }, value: Number(slotCounts?.expired ?? 0) },
  ]);
  metric("medibrowserr_slots_found_total", "counter", "Slots ever discovered", [
    { value: Number(slotCounts?.total ?? 0) },
  ]);

  const notifications = await db
    .select({
      channel: schema.notifications.channel,
      status: schema.notifications.status,
      count: sql<number>`count(*)`,
    })
    .from(schema.notifications)
    .groupBy(schema.notifications.channel, schema.notifications.status);
  metric(
    "medibrowserr_notifications_total",
    "counter",
    "Notification attempts by channel and status (within retention)",
    notifications.map((n) => ({
      labels: { channel: n.channel ?? "unknown", status: n.status },
      value: Number(n.count),
    })),
  );

  const coverage = await db
    .select({ verdict: schema.coverageServices.verdict, count: sql<number>`count(*)` })
    .from(schema.coverageServices)
    .groupBy(schema.coverageServices.verdict);
  metric(
    "medibrowserr_coverage_services",
    "gauge",
    "Locally indexed services by plan verdict",
    coverage.map((c) => ({ labels: { verdict: c.verdict ?? "pending" }, value: Number(c.count) })),
  );

  const seed = await getSeedStatus();
  const seedStates = ["idle", "running", "done", "error", "stopped", "cooldown"] as const;
  metric(
    "medibrowserr_coverage_seed_state",
    "gauge",
    "Coverage index build state (1 = current state)",
    seedStates.map((state) => ({ labels: { state }, value: seed.state === state ? 1 : 0 })),
  );
  metric("medibrowserr_coverage_seed_progress", "gauge", "Verdicts fetched in the current/last run", [
    { labels: { side: "done" }, value: seed.done },
    { labels: { side: "total" }, value: seed.total },
  ]);

  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
