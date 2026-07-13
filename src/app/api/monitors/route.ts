import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { monitorInputSchema } from "@/lib/monitor-schema";
import { getDb, schema } from "@/server/db";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.monitors)
      .orderBy(desc(schema.monitors.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const input = monitorInputSchema.parse(await req.json());
    const db = await getDb();
    const [row] = await db
      .insert(schema.monitors)
      .values({
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
        nextRunAt: Date.now(), // run on the next scheduler tick
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
