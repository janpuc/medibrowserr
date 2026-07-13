import "server-only";
import { eq, isNull, lt, max, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getCoverageSummary, searchCoveredServices } from "@/server/medicover/client";
import { getMedicoverSession, readSeedState, writeSeedState } from "./state";
import { classifyCoverage } from "./verdict";

/** The catalog barely changes; re-verify verdicts every 3 weeks. */
export const SEED_TTL_MS = 21 * 24 * 3600 * 1000;
const CATALOG_PAGE_SIZE = 1000;
const WORKERS = 6;
const WORKER_DELAY_MS = 80;

export interface SeedStatus {
  state: "idle" | "running" | "done" | "error";
  done: number;
  total: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

type GlobalWithSeeder = typeof globalThis & {
  __medibrowserrSeeder?: { running: boolean; status: SeedStatus };
};

function slot(): NonNullable<GlobalWithSeeder["__medibrowserrSeeder"]> {
  const g = globalThis as GlobalWithSeeder;
  if (!g.__medibrowserrSeeder) {
    g.__medibrowserrSeeder = { running: false, status: { state: "idle", done: 0, total: 0 } };
  }
  return g.__medibrowserrSeeder;
}

export async function getSeedStatus(): Promise<SeedStatus & { freshUntil: number | null }> {
  const s = slot();
  const status = s.running ? s.status : ((await readSeedState()) ?? s.status);
  const db = await getDb();
  const [row] = await db
    .select({ newest: max(schema.coverageServices.fetchedAt) })
    .from(schema.coverageServices);
  return { ...status, freshUntil: row?.newest ? row.newest + SEED_TTL_MS : null };
}

/** True when the index is missing, incomplete or older than the TTL. */
export async function isSeedStale(): Promise<boolean> {
  const db = await getDb();
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`sum(case when verdict is null then 1 else 0 end)`,
      newest: max(schema.coverageServices.fetchedAt),
    })
    .from(schema.coverageServices);
  if (!counts?.total) return true;
  if (counts.pending && Number(counts.pending) > 0) return true;
  return !counts.newest || counts.newest < Date.now() - SEED_TTL_MS;
}

/**
 * Builds the local coverage index: full catalog first (fast), then a gentle
 * per-service verdict crawl (~8k services ≈ 20 min). Resumable — only rows
 * with no/stale verdicts are (re)fetched. Runs at most once per process.
 */
export function startCoverageSeed(force = false): SeedStatus {
  const s = slot();
  if (s.running) return s.status;
  s.running = true;
  s.status = { state: "running", done: 0, total: 0, startedAt: Date.now() };
  void (async () => {
    try {
      await runSeed(s, force);
      s.status = { ...s.status, state: "done", finishedAt: Date.now() };
    } catch (err) {
      s.status = {
        ...s.status,
        state: "error",
        finishedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      };
      console.warn("[coverage-seed] failed:", s.status.error);
    } finally {
      s.running = false;
      await writeSeedState(s.status).catch(() => {});
    }
  })();
  return s.status;
}

async function runSeed(
  s: NonNullable<GlobalWithSeeder["__medibrowserrSeeder"]>,
  force: boolean,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  // Pass 1: sync the catalog (names/codes/descriptions).
  console.log("[coverage-seed] syncing catalog…");
  const seenIds = new Set<string>();
  for (let page = 1; ; page++) {
    const { items } = await searchCoveredServices("", page, CATALOG_PAGE_SIZE);
    for (const item of items) {
      if (!item.serviceId || seenIds.has(item.serviceId)) continue;
      seenIds.add(item.serviceId);
      await db
        .insert(schema.coverageServices)
        .values({
          serviceId: item.serviceId,
          name: item.serviceName,
          code: item.serviceCode ?? null,
          description: item.serviceDescription ?? null,
          catalogAt: now,
        })
        .onConflictDoUpdate({
          target: schema.coverageServices.serviceId,
          set: {
            name: item.serviceName,
            code: item.serviceCode ?? null,
            description: item.serviceDescription ?? null,
            catalogAt: now,
          },
        });
    }
    if (items.length < CATALOG_PAGE_SIZE) break;
  }
  // Drop services that vanished from the catalog (not touched this pass).
  if (seenIds.size) {
    await db
      .delete(schema.coverageServices)
      .where(lt(schema.coverageServices.catalogAt, now));
  }
  console.log(`[coverage-seed] catalog synced: ${seenIds.size} services`);

  // Pass 2: verdicts for pending/stale rows.
  const staleBefore = force ? Date.now() + 1 : Date.now() - SEED_TTL_MS;
  const pending = await db
    .select({ serviceId: schema.coverageServices.serviceId })
    .from(schema.coverageServices)
    .where(
      or(
        isNull(schema.coverageServices.fetchedAt),
        lt(schema.coverageServices.fetchedAt, staleBefore),
      ),
    );
  s.status.total = pending.length;
  s.status.done = 0;
  console.log(`[coverage-seed] fetching ${pending.length} verdicts…`);

  const queue = [...pending];
  let persisted = 0;
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        const summary = await getCoverageSummary(next.serviceId);
        const c = classifyCoverage(summary.productSummaries);
        await db
          .update(schema.coverageServices)
          .set({
            verdict: c.verdict,
            referralRequired: c.referralRequired,
            discount: c.discount,
            fixedPayment: c.fixedPayment,
            volumeLimit: c.volumeLimit,
            volumeUsed: c.volumeUsed,
            valueLimit: c.valueLimit,
            valueUsed: c.valueUsed,
            productName: c.productName,
            planName: c.planName,
            remarks: JSON.stringify(c.remarks),
            summaryJson: JSON.stringify(summary.productSummaries ?? []),
            fetchedAt: Date.now(),
          })
          .where(eq(schema.coverageServices.serviceId, next.serviceId));
      } catch (err) {
        // Leave the row pending; the next (re)run picks it up.
        console.warn(
          `[coverage-seed] service ${next.serviceId} failed:`,
          err instanceof Error ? err.message : err,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
      s.status.done++;
      if (++persisted % 100 === 0) {
        await writeSeedState({ ...s.status }).catch(() => {});
        console.log(`[coverage-seed] ${s.status.done}/${s.status.total}`);
      }
      await new Promise((r) => setTimeout(r, WORKER_DELAY_MS));
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log("[coverage-seed] finished");
}

/** Called from the scheduler tick: seeds automatically when connected & stale. */
export async function autoSeedIfStale(): Promise<void> {
  const s = slot();
  if (s.running) return;
  const session = await getMedicoverSession();
  if (session.status !== "connected") return;
  if (await isSeedStale()) {
    console.log("[coverage-seed] index stale — starting background seed");
    startCoverageSeed();
  }
}
