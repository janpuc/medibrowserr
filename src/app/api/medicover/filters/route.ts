import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getFilters } from "@/server/medicover/client";

const parseIdList = (value: string | null): number[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) // "" would otherwise become 0 and confuse the gateway
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

/**
 * GET /api/medicover/filters?regionIds=204,202&specialtyIds=132&type=Standard
 * Returns { regions, specialties, clinics, doctors } for the current scope.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters = await getFilters({
      regionIds: parseIdList(url.searchParams.get("regionIds")),
      specialtyIds: parseIdList(url.searchParams.get("specialtyIds")),
      slotSearchType: url.searchParams.get("type") ?? "Standard",
    });
    return NextResponse.json(filters);
  } catch (err) {
    return apiError(err);
  }
}
