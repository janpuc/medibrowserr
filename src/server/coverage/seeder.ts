import "server-only";
import { eq, isNull, lt, max, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getCoverageSummary, searchCoveredServices } from "@/server/medicover/client";
import { getMedicoverSession, readSeedState, writeSeedState } from "./state";
import { classifyCoverage } from "./verdict";

/** The catalog barely changes; re-verify verdicts every 3 weeks. */
export const SEED_TTL_MS = 21 * 24 * 3600 * 1000;
const CATALOG_PAGE_SIZE = 1000;

// Pacing: ~2.5 requests/second with jitter. Faster settings (6 workers /
// 80 ms ≈ 10 rps) got real users' IPs temporarily blocked by Medicover's
// WAF — a full pass now takes ~1h, but it runs unattended in the background.
const WORKERS = Number(process.env.MEDIBROWSERR_SEED_CONCURRENCY) || 2;
const WORKER_DELAY_MS = Number(process.env.MEDIBROWSERR_SEED_DELAY_MS) || 300;

// Circuit breaker: this many consecutive failures means Medicover is
// refusing us (rate limit) — stop and cool down instead of digging deeper.
const BREAKER_THRESHOLD = 8;
const COOLDOWN_MS = 20 * 60 * 1000;
/** A manual stop keeps the auto-seeder away for a day. */
const MANUAL_STOP_HOLDOFF_MS = 24 * 3600 * 1000;

export interface SeedStatus {
  state: "idle" | "running" | "done" | "error" | "stopped" | "cooldown";
  done: number;
  total: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Set while rate-limited; the auto-seeder resumes after this passes. */
  cooldownUntil?: number;
  /** Set when the user pressed Pause; blocks auto-resume for a while. */
  stoppedAt?: number;
}

type GlobalWithSeeder = typeof globalThis & {
  __medibrowserrSeeder?: { running: boolean; stopRequested: boolean; status: SeedStatus };
};

function slot(): NonNullable<GlobalWithSeeder["__medibrowserrSeeder"]> {
  const g = globalThis as GlobalWithSeeder;
  if (!g.__medibrowserrSeeder) {
    g.__medibrowserrSeeder = {
      running: false,
      stopRequested: false,
      status: { state: "idle", done: 0, total: 0 },
    };
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

/** Asks a running seed to stop after the in-flight requests finish. */
export async function stopCoverageSeed(): Promise<void> {
  const s = slot();
  if (!s.running) return;
  s.stopRequested = true;
  console.log("[coverage-seed] stop requested");
}

/**
 * Builds the local coverage index: full catalog first (fast), then a gentle
 * per-service verdict crawl. Resumable — only rows with no/stale verdicts
 * are (re)fetched, so pauses, cooldowns and restarts lose nothing.
 */
export function startCoverageSeed(force = false): SeedStatus {
  const s = slot();
  if (s.running) return s.status;
  s.running = true;
  s.stopRequested = false;
  s.status = { state: "running", done: 0, total: 0, startedAt: Date.now() };
  void (async () => {
    try {
      const outcome = await runSeed(s, force);
      if (outcome === "stopped") {
        s.status = { ...s.status, state: "stopped", stoppedAt: Date.now(), finishedAt: Date.now() };
        console.log("[coverage-seed] paused by user");
      } else if (outcome === "cooldown") {
        s.status = {
          ...s.status,
          state: "cooldown",
          cooldownUntil: Date.now() + COOLDOWN_MS,
          finishedAt: Date.now(),
          error:
            "Medicover started refusing connections (rate limit); pausing and retrying later",
        };
        console.warn(
          `[coverage-seed] ${BREAKER_THRESHOLD} consecutive connection failures — ` +
            `looks like rate limiting. Cooling down for ${COOLDOWN_MS / 60000} min; ` +
            `progress is saved and the run resumes automatically.`,
        );
      } else {
        s.status = { ...s.status, state: "done", finishedAt: Date.now() };
      }
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
): Promise<"done" | "stopped" | "cooldown"> {
  const db = await getDb();
  const now = Date.now();

  // Pass 1: sync the catalog (names/codes/descriptions).
  console.log("[coverage-seed] syncing catalog…");
  const seenIds = new Set<string>();
  for (let page = 1; ; page++) {
    if (s.stopRequested) return "stopped";
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
  console.log(
    `[coverage-seed] fetching ${pending.length} verdicts ` +
      `(${WORKERS} workers, ~${Math.round((WORKERS * 1000) / (WORKER_DELAY_MS + 400))}/s — ` +
      `deliberately slow to stay under Medicover's rate limits)`,
  );

  const queue = [...pending];
  let persisted = 0;
  let consecutiveFailures = 0;
  let tripped = false;

  const worker = async () => {
    for (;;) {
      if (s.stopRequested || tripped) return;
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
        consecutiveFailures = 0;
        s.status.done++;
      } catch (err) {
        // Leave the row pending; a later run picks it up.
        consecutiveFailures++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[coverage-seed] service ${next.serviceId} failed (${consecutiveFailures} in a row): ${msg}`,
        );
        if (consecutiveFailures >= BREAKER_THRESHOLD) {
          tripped = true;
          return;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (++persisted % 100 === 0) {
        await writeSeedState({ ...s.status }).catch(() => {});
        console.log(`[coverage-seed] ${s.status.done}/${s.status.total}`);
      }
      // Jittered pause so requests don't form a regular drumbeat.
      const jitter = WORKER_DELAY_MS * (0.7 + Math.random() * 0.6);
      await new Promise((r) => setTimeout(r, jitter));
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  if (s.stopRequested) return "stopped";
  if (tripped) return "cooldown";
  console.log("[coverage-seed] finished");
  return "done";
}

/** Called from the scheduler tick: seeds automatically when connected & stale. */
export async function autoSeedIfStale(): Promise<void> {
  const s = slot();
  if (s.running) return;
  const stored = await readSeedState();
  const now = Date.now();
  // Respect a rate-limit cooldown and a recent manual pause.
  if (stored?.state === "cooldown" && stored.cooldownUntil && now < stored.cooldownUntil) return;
  if (stored?.state === "stopped" && stored.stoppedAt && now - stored.stoppedAt < MANUAL_STOP_HOLDOFF_MS)
    return;
  const session = await getMedicoverSession();
  if (session.status !== "connected") return;
  if (await isSeedStale()) {
    console.log("[coverage-seed] index stale — starting background seed");
    startCoverageSeed();
  }
}
