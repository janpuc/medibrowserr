import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/server/db";
import { runMonitor } from "@/server/monitors/engine";

type Ctx = { params: Promise<{ id: string }> };

/** "Run now" — used by the UI to test a monitor immediately. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const id = Number((await ctx.params).id);
    const db = await getDb();
    const rows = await db.select().from(schema.monitors).where(eq(schema.monitors.id, id));
    if (!rows.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const result = await runMonitor(rows[0]);
    return NextResponse.json({
      found: result.found,
      newCount: result.newSlots.length,
      notified: result.notified,
    });
  } catch (err) {
    return apiError(err);
  }
}
