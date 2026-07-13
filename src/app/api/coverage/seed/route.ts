import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSeedStatus, startCoverageSeed } from "@/server/coverage/seeder";

export async function GET() {
  try {
    return NextResponse.json(await getSeedStatus());
  } catch (err) {
    return apiError(err);
  }
}

const bodySchema = z.object({ force: z.boolean().default(false) });

/** Kicks off the background index build (no-op when already running). */
export async function POST(req: Request) {
  try {
    const { force } = bodySchema.parse(await req.json().catch(() => ({})));
    startCoverageSeed(force);
    return NextResponse.json(await getSeedStatus());
  } catch (err) {
    return apiError(err);
  }
}
