import "server-only";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { MfaInteractionRequired } from "@/server/medicover/auth";
import { searchSlots } from "@/server/medicover/client";
import {
  applyDoctorNameFilter,
  nowWarsawIso,
  splitGoneCandidates,
} from "@/server/medicover/slots";
import type { Slot, SlotSearchParams } from "@/server/medicover/types";
import {
  buildGoneNotification,
  buildNotification,
  SYSTEM_MESSAGES,
  type MessageLanguage,
} from "@/server/notify/messages";
import { dispatchNotification } from "@/server/notify/dispatch";
import {
  getMedicoverSession,
  getSettings,
  saveMedicoverSession,
} from "@/server/settings";

export type MonitorRow = typeof schema.monitors.$inferSelect;
type FoundSlotRow = typeof schema.foundSlots.$inferSelect;

export function dedupeKey(slot: Slot): string {
  return crypto
    .createHash("sha1")
    .update(
      [slot.appointmentDate, slot.doctor?.id ?? "", slot.clinic?.id ?? "", slot.specialty?.id ?? ""].join("|"),
    )
    .digest("hex");
}

const parseIds = (json: string): number[] => {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};

export function monitorSearchParams(monitor: MonitorRow): SlotSearchParams {
  return {
    regionIds: parseIds(monitor.regionIds),
    specialtyIds: parseIds(monitor.specialtyIds),
    clinicIds: parseIds(monitor.clinicIds),
    doctorIds: parseIds(monitor.doctorIds),
    doctorLanguageId: monitor.doctorLanguageId ?? undefined,
    startDate: monitor.startDate ?? undefined,
    endDate: monitor.endDate ?? undefined,
    startHour: monitor.startHour ?? undefined,
    endHour: monitor.endHour ?? undefined,
    slotSearchType:
      monitor.slotSearchType === "DiagnosticProcedure" ? "DiagnosticProcedure" : "Standard",
  };
}

/** Notification links point at this app when its URL is configured. */
async function notificationLink(lang: MessageLanguage): Promise<{ url: string; urlTitle: string }> {
  const { appUrl } = await getSettings();
  if (appUrl) {
    return {
      url: `${appUrl}/appointments`,
      urlTitle: lang === "pl" ? "Otwórz medibrowserr" : "Open medibrowserr",
    };
  }
  return {
    url: "https://online24.medicover.pl/home",
    urlTitle: lang === "pl" ? "Otwórz Medicover OnLine" : "Open Medicover OnLine",
  };
}

const rowToSlot = (row: FoundSlotRow): Slot => ({
  appointmentDate: row.appointmentDate,
  doctor: row.doctorName ? { id: row.doctorId ?? "", name: row.doctorName } : null,
  clinic: { id: row.clinicId ?? "", name: row.clinicName ?? "" },
  specialty: { id: row.specialtyId ?? "", name: row.specialtyName ?? "" },
  visitType: row.visitType ?? undefined,
});

export interface RunResult {
  found: number;
  newSlots: Slot[];
  goneSlots: Slot[];
  notified: boolean;
}

/**
 * Runs one monitor sweep. Notification contract:
 *  - brand-new slots (incl. ones that came BACK after being taken) → alert;
 *  - slots seen before and still present → silence;
 *  - future slots that vanished → someone took them → one-step-lower-priority
 *    alert; past-dated ones just expire silently.
 */
export async function runMonitor(monitor: MonitorRow): Promise<RunResult> {
  const db = await getDb();
  const now = Date.now();
  const lang = (monitor.messageLanguage === "en" ? "en" : "pl") as MessageLanguage;
  try {
    const slots = applyDoctorNameFilter(
      await searchSlots(monitorSearchParams(monitor)),
      monitor.doctorNameFilter,
    );
    const currentKeys = new Set(slots.map(dedupeKey));

    // One query for the monitor's whole history: sweep diffing happens
    // in-memory instead of a SELECT per slot.
    const allRows = await db
      .select()
      .from(schema.foundSlots)
      .where(eq(schema.foundSlots.monitorId, monitor.id));
    const rowsByKey = new Map(allRows.map((row) => [row.dedupeKey, row]));
    // Snapshot of what we believed was still bookable before this sweep.
    const activeRows = allRows.filter((row) => row.goneAt === null);

    const newSlots: Slot[] = [];
    for (const slot of slots) {
      const key = dedupeKey(slot);
      const existing = rowsByKey.get(key);
      if (!existing) {
        newSlots.push(slot);
        await db.insert(schema.foundSlots).values({
          monitorId: monitor.id,
          dedupeKey: key,
          appointmentDate: slot.appointmentDate,
          doctorId: slot.doctor?.id ?? null,
          doctorName: slot.doctor?.name ?? null,
          clinicId: slot.clinic?.id ?? null,
          clinicName: slot.clinic?.name ?? null,
          specialtyId: slot.specialty?.id ?? null,
          specialtyName: slot.specialty?.name ?? null,
          visitType: slot.visitType ?? null,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      } else if (existing.goneAt) {
        // The slot came back (a cancellation?) — that's news again.
        newSlots.push(slot);
        await db
          .update(schema.foundSlots)
          .set({ goneAt: null, goneReason: null, lastSeenAt: now, notifiedAt: null })
          .where(eq(schema.foundSlots.id, existing.id));
      } else {
        await db
          .update(schema.foundSlots)
          .set({ lastSeenAt: now })
          .where(eq(schema.foundSlots.id, existing.id));
      }
    }

    // Slots that vanished since the last sweep.
    const { taken, expired } = splitGoneCandidates(activeRows, currentKeys, nowWarsawIso());
    for (const row of expired) {
      await db
        .update(schema.foundSlots)
        .set({ goneAt: now, goneReason: "expired" })
        .where(eq(schema.foundSlots.id, row.id));
    }
    for (const row of taken) {
      await db
        .update(schema.foundSlots)
        .set({ goneAt: now, goneReason: "taken" })
        .where(eq(schema.foundSlots.id, row.id));
    }

    const link = await notificationLink(lang);
    let notified = false;

    if (newSlots.length) {
      const { title, message } = buildNotification(
        monitor.name,
        newSlots[0]?.specialty?.name,
        newSlots,
        lang,
        monitor.messageTemplate,
      );
      const result = await dispatchNotification({
        title,
        message,
        priority: monitor.pushoverPriority,
        monitorId: monitor.id,
        ...link,
      });
      notified = result.sent.length > 0;
      if (notified) {
        for (const slot of newSlots) {
          await db
            .update(schema.foundSlots)
            .set({ notifiedAt: Date.now() })
            .where(
              and(
                eq(schema.foundSlots.monitorId, monitor.id),
                eq(schema.foundSlots.dedupeKey, dedupeKey(slot)),
              ),
            );
        }
      }
    }

    if (taken.length) {
      const { title, message } = buildGoneNotification(
        monitor.name,
        taken.map(rowToSlot),
        lang,
      );
      await dispatchNotification({
        title,
        message,
        // One step quieter than the monitor's own alerts.
        priority: Math.max(monitor.pushoverPriority - 1, -2),
        monitorId: monitor.id,
        ...link,
      });
    }

    await db
      .update(schema.monitors)
      .set({
        lastRunAt: now,
        lastStatus: "ok",
        lastError: null,
        lastFoundCount: slots.length,
        nextRunAt: now + monitor.intervalMinutes * 60_000,
      })
      .where(eq(schema.monitors.id, monitor.id));

    return { found: slots.length, newSlots, goneSlots: taken.map(rowToSlot), notified };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.monitors)
      .set({
        lastRunAt: now,
        lastStatus: "error",
        lastError: message.slice(0, 500),
        // Back off harder on errors so a broken login doesn't hammer Medicover.
        nextRunAt: now + Math.max(monitor.intervalMinutes, 30) * 60_000,
      })
      .where(eq(schema.monitors.id, monitor.id));

    if (err instanceof MfaInteractionRequired) {
      await notifyActionRequiredOnce(lang);
    }
    throw err;
  }
}

/** Pings the user (once per pending login) when MFA blocks the scheduler. */
async function notifyActionRequiredOnce(lang: MessageLanguage): Promise<void> {
  const session = await getMedicoverSession();
  if (session.statusDetail?.includes("[notified]")) return;
  const msg = SYSTEM_MESSAGES[lang === "en" ? "en" : "pl"];
  const { appUrl } = await getSettings();
  await dispatchNotification({
    title: msg.actionRequiredTitle,
    message: msg.actionRequiredBody,
    priority: 1,
    ...(appUrl
      ? { url: `${appUrl}/settings`, urlTitle: lang === "pl" ? "Otwórz ustawienia" : "Open settings" }
      : {}),
  });
  await saveMedicoverSession({
    statusDetail: `${session.statusDetail ?? "MFA required"} [notified]`,
  });
}
