import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/server/db";

/** Feed of every slot the monitors have discovered (newest first). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const monitorId = url.searchParams.get("monitorId");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const db = await getDb();
    const base = db
      .select({
        slot: schema.foundSlots,
        monitorName: schema.monitors.name,
      })
      .from(schema.foundSlots)
      .leftJoin(schema.monitors, eq(schema.foundSlots.monitorId, schema.monitors.id))
      .orderBy(desc(schema.foundSlots.firstSeenAt))
      .limit(limit);
    const rows = monitorId
      ? await base.where(eq(schema.foundSlots.monitorId, Number(monitorId)))
      : await base;
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}
