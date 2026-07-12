import "server-only";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { MfaInteractionRequired } from "@/server/medicover/auth";
import { searchSlots } from "@/server/medicover/client";
import { applyDoctorNameFilter } from "@/server/medicover/slots";
import type { Slot, SlotSearchParams } from "@/server/medicover/types";
import { buildNotification, SYSTEM_MESSAGES, type MessageLanguage } from "@/server/notify/messages";
import { sendPushover } from "@/server/notify/pushover";
import { getMedicoverSession, saveMedicoverSession } from "@/server/settings";

export type MonitorRow = typeof schema.monitors.$inferSelect;

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


export interface RunResult {
  found: number;
  newSlots: Slot[];
  notified: boolean;
}

/** Runs one monitor: search → dedupe against history → notify new finds. */
export async function runMonitor(monitor: MonitorRow): Promise<RunResult> {
  const db = await getDb();
  const now = Date.now();
  try {
    const slots = applyDoctorNameFilter(
      await searchSlots(monitorSearchParams(monitor)),
      monitor.doctorNameFilter,
    );

    const newSlots: Slot[] = [];
    for (const slot of slots) {
      const key = dedupeKey(slot);
      const existing = await db
        .select({ id: schema.foundSlots.id })
        .from(schema.foundSlots)
        .where(
          and(
            eq(schema.foundSlots.monitorId, monitor.id),
            eq(schema.foundSlots.dedupeKey, key),
          ),
        );
      if (existing.length) {
        await db
          .update(schema.foundSlots)
          .set({ lastSeenAt: now })
          .where(eq(schema.foundSlots.id, existing[0].id));
      } else {
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
      }
    }

    let notified = false;
    if (newSlots.length) {
      const lang = (monitor.messageLanguage === "en" ? "en" : "pl") as MessageLanguage;
      const { title, message } = buildNotification(
        monitor.name,
        newSlots[0]?.specialty?.name,
        newSlots,
        lang,
      );
      const result = await sendPushover({
        title,
        message,
        priority: monitor.pushoverPriority,
        monitorId: monitor.id,
        url: "https://online24.medicover.pl/home",
        urlTitle: lang === "pl" ? "Otwórz Medicover OnLine" : "Open Medicover OnLine",
      });
      notified = result.ok;
      if (result.ok) {
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

    return { found: slots.length, newSlots, notified };
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
      await notifyActionRequiredOnce(monitor.messageLanguage as MessageLanguage);
    }
    throw err;
  }
}

/** Pings the user (once per pending login) when MFA blocks the scheduler. */
async function notifyActionRequiredOnce(lang: MessageLanguage): Promise<void> {
  const session = await getMedicoverSession();
  if (session.statusDetail?.includes("[notified]")) return;
  const msg = SYSTEM_MESSAGES[lang === "en" ? "en" : "pl"];
  await sendPushover({ title: msg.actionRequiredTitle, message: msg.actionRequiredBody, priority: 1 });
  await saveMedicoverSession({
    statusDetail: `${session.statusDetail ?? "MFA required"} [notified]`,
  });
}
