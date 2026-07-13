import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { monitorInputSchema } from "@/lib/monitor-schema";
import { getDb, schema } from "@/server/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = Number((await ctx.params).id);
    const db = await getDb();
    const rows = await db.select().from(schema.monitors).where(eq(schema.monitors.id, id));
    if (!rows.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = Number((await ctx.params).id);
    const patch = monitorInputSchema.partial().parse(await req.json());
    const db = await getDb();

    const set: Record<string, unknown> = {};
    const jsonFields = [
      "regionIds",
      "regionNames",
      "specialtyIds",
      "specialtyNames",
      "clinicIds",
      "clinicNames",
      "doctorIds",
      "doctorNames",
    ] as const;
    for (const key of jsonFields) {
      if (patch[key] !== undefined) set[key] = JSON.stringify(patch[key]);
    }
    for (const key of [
      "name",
      "doctorNameFilter",
      "startDate",
      "endDate",
      "startHour",
      "endHour",
      "slotSearchType",
      "doctorLanguageId",
      "intervalMinutes",
      "active",
      "messageLanguage",
      "messageTemplate",
      "pushoverPriority",
    ] as const) {
      if (patch[key] !== undefined) set[key] = patch[key];
    }
    // Re-activating or rescheduling should take effect promptly.
    if (patch.active || patch.intervalMinutes !== undefined) set.nextRunAt = Date.now();

    // A changed search scope invalidates the "still bookable" bookkeeping —
    // expire active slots silently so they don't get reported as "taken".
    const scopeKeys = [
      "regionIds",
      "specialtyIds",
      "clinicIds",
      "doctorIds",
      "doctorNameFilter",
      "startDate",
      "endDate",
      "startHour",
      "endHour",
      "slotSearchType",
      "doctorLanguageId",
    ] as const;
    if (scopeKeys.some((key) => patch[key] !== undefined)) {
      await db
        .update(schema.foundSlots)
        .set({ goneAt: Date.now(), goneReason: "expired" })
        .where(and(eq(schema.foundSlots.monitorId, id), isNull(schema.foundSlots.goneAt)));
    }

    const [row] = await db
      .update(schema.monitors)
      .set(set)
      .where(eq(schema.monitors.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const id = Number((await ctx.params).id);
    const db = await getDb();
    await db.delete(schema.foundSlots).where(eq(schema.foundSlots.monitorId, id));
    await db.delete(schema.monitors).where(eq(schema.monitors.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
