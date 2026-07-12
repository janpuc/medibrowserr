import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import {
  getBenefitPlans,
  getCoverageSummary,
  searchCoveredServices,
} from "@/server/medicover/client";

/**
 * Coverage ("is this covered by my plan?"):
 *  - GET /api/coverage                     → my benefit plans
 *  - GET /api/coverage?q=kardiolog         → service autocomplete
 *  - GET /api/coverage?serviceId=123       → coverage summary for a service
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    const serviceId = url.searchParams.get("serviceId");
    if (serviceId) {
      return NextResponse.json(await getCoverageSummary(serviceId));
    }
    if (q !== null) {
      return NextResponse.json(await searchCoveredServices(q));
    }
    return NextResponse.json(await getBenefitPlans());
  } catch (err) {
    return apiError(err);
  }
}
