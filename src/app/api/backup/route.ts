import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { monitorInputSchema } from "@/lib/monitor-schema";
import { settingsPatchSchema } from "@/lib/settings-schema";
import { getDb, schema } from "@/server/db";
import { getStoredSettings, saveSettings } from "@/server/settings";

/**
 * Backup = DB-stored settings (exactly what the user typed, never env
 * values) + monitor configurations. Slot history, notification logs and the
 * coverage index are rebuildable and stay out; the Medicover session
 * (tokens/trusted device) is deliberately excluded — reconnect after import.
 */
export async function GET() {
  try {
    const db = await getDb();
    const monitors = await db.select().from(schema.monitors);
    const backup = {
      app: "medibrowserr",
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: await getStoredSettings(),
      monitors: monitors.map((m) => ({
        name: m.name,
        regionIds: JSON.parse(m.regionIds),
        regionNames: JSON.parse(m.regionNames),
        specialtyIds: JSON.parse(m.specialtyIds),
        specialtyNames: JSON.parse(m.specialtyNames),
        clinicIds: JSON.parse(m.clinicIds),
        clinicNames: JSON.parse(m.clinicNames),
        doctorIds: JSON.parse(m.doctorIds),
        doctorNames: JSON.parse(m.doctorNames),
        doctorNameFilter: m.doctorNameFilter,
        startDate: m.startDate,
        endDate: m.endDate,
        startHour: m.startHour,
        endHour: m.endHour,
        slotSearchType: m.slotSearchType,
        doctorLanguageId: m.doctorLanguageId,
        intervalMinutes: m.intervalMinutes,
        active: m.active,
        messageLanguage: m.messageLanguage,
        messageTemplate: m.messageTemplate,
        pushoverPriority: m.pushoverPriority,
      })),
    };
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="medibrowserr-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

const importSchema = z.object({
  app: z.literal("medibrowserr"),
  backupVersion: z.number().int().min(1).max(1),
  settings: settingsPatchSchema.default({}),
  monitors: z.array(monitorInputSchema).default([]),
});

/**
 * Restores a backup. Settings merge into the store — env-pinned values
 * stay untouched (saveSettings strips locked keys). Monitors whose name
 * already exists are skipped rather than duplicated.
 */
export async function POST(req: Request) {
  try {
    const backup = importSchema.parse(await req.json());
    await saveSettings(backup.settings);

    const db = await getDb();
    const existing = await db.select({ name: schema.monitors.name }).from(schema.monitors);
    const existingNames = new Set(existing.map((m) => m.name));
    let imported = 0;
    let skipped = 0;
    for (const input of backup.monitors) {
      if (existingNames.has(input.name)) {
        skipped++;
        continue;
      }
      await db.insert(schema.monitors).values({
        name: input.name,
        regionIds: JSON.stringify(input.regionIds),
        regionNames: JSON.stringify(input.regionNames),
        specialtyIds: JSON.stringify(input.specialtyIds),
        specialtyNames: JSON.stringify(input.specialtyNames),
        clinicIds: JSON.stringify(input.clinicIds),
        clinicNames: JSON.stringify(input.clinicNames),
        doctorIds: JSON.stringify(input.doctorIds),
        doctorNames: JSON.stringify(input.doctorNames),
        doctorNameFilter: input.doctorNameFilter || null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        startHour: input.startHour ?? null,
        endHour: input.endHour ?? null,
        slotSearchType: input.slotSearchType,
        doctorLanguageId: input.doctorLanguageId ?? null,
        intervalMinutes: input.intervalMinutes,
        active: input.active,
        messageLanguage: input.messageLanguage,
        messageTemplate: input.messageTemplate?.trim() || null,
        pushoverPriority: input.pushoverPriority,
        createdAt: Date.now(),
        nextRunAt: Date.now(),
      });
      imported++;
    }
    return NextResponse.json({ imported, skipped });
  } catch (err) {
    return apiError(err);
  }
}
