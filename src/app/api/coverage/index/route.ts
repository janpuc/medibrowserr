import { NextResponse } from "next/server";
import { and, asc, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/server/db";
import { getSeedStatus } from "@/server/coverage/seeder";
import { IN_PLAN_VERDICTS } from "@/server/coverage/verdict";

const PAGE_SIZE = 100;

/**
 * Local, instant coverage index (built by the seeder):
 * GET /api/coverage/index?q=usg&filter=inplan|discount|payable|all&page=1
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const filter = url.searchParams.get("filter") ?? "inplan";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const db = await getDb();
    const t = schema.coverageServices;

    const conditions: SQL[] = [];
    if (q) {
      const needle = `%${q}%`;
      conditions.push(or(like(t.name, needle), like(t.code, needle))!);
    }
    if (filter === "inplan") conditions.push(inArray(t.verdict, IN_PLAN_VERDICTS));
    else if (filter === "discount") conditions.push(inArray(t.verdict, ["discount", "fixed_price"]));
    else if (filter === "payable") conditions.push(inArray(t.verdict, ["payable"]));
    const where = conditions.length ? and(...conditions) : undefined;

    const items = await db
      .select({
        serviceId: t.serviceId,
        name: t.name,
        code: t.code,
        verdict: t.verdict,
        referralRequired: t.referralRequired,
        discount: t.discount,
        fixedPayment: t.fixedPayment,
        volumeLimit: t.volumeLimit,
        volumeUsed: t.volumeUsed,
        valueLimit: t.valueLimit,
        valueUsed: t.valueUsed,
      })
      .from(t)
      .where(where)
      .orderBy(asc(t.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    // Counts per chip, respecting the search text but not the active filter.
    const searchWhere = q
      ? or(like(t.name, `%${q}%`), like(t.code, `%${q}%`))
      : undefined;
    const [counts] = await db
      .select({
        all: sql<number>`count(*)`,
        inplan: sql<number>`sum(case when verdict in ('covered','covered_referral') then 1 else 0 end)`,
        discount: sql<number>`sum(case when verdict in ('discount','fixed_price') then 1 else 0 end)`,
        payable: sql<number>`sum(case when verdict = 'payable' then 1 else 0 end)`,
        pending: sql<number>`sum(case when verdict is null then 1 else 0 end)`,
      })
      .from(t)
      .where(searchWhere);

    return NextResponse.json({
      items,
      page,
      pageSize: PAGE_SIZE,
      counts: {
        all: Number(counts?.all ?? 0),
        inplan: Number(counts?.inplan ?? 0),
        discount: Number(counts?.discount ?? 0),
        payable: Number(counts?.payable ?? 0),
        pending: Number(counts?.pending ?? 0),
      },
      seed: await getSeedStatus(),
    });
  } catch (err) {
    return apiError(err);
  }
}
