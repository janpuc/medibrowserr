import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/server/db";

type Ctx = { params: Promise<{ id: string }> };

/** Full locally-indexed detail for one service (description, fine print…). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.coverageServices)
      .where(eq(schema.coverageServices.serviceId, id));
    if (!rows.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const row = rows[0];
    return NextResponse.json({
      ...row,
      remarks: safeParse<string[]>(row.remarks) ?? [],
      summaries: safeParse<unknown[]>(row.summaryJson) ?? [],
      summaryJson: undefined,
    });
  } catch (err) {
    return apiError(err);
  }
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
