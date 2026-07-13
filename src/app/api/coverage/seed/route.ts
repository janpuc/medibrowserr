import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  getSeedStatus,
  startCoverageSeed,
  stopCoverageSeed,
} from "@/server/coverage/seeder";

export async function GET() {
  try {
    return NextResponse.json(await getSeedStatus());
  } catch (err) {
    return apiError(err);
  }
}

const bodySchema = z.object({
  action: z.enum(["start", "stop"]).default("start"),
  force: z.boolean().default(false),
});

/** Starts or pauses the background index build. Both are idempotent. */
export async function POST(req: Request) {
  try {
    const { action, force } = bodySchema.parse(await req.json().catch(() => ({})));
    if (action === "stop") await stopCoverageSeed();
    else startCoverageSeed(force);
    return NextResponse.json(await getSeedStatus());
  } catch (err) {
    return apiError(err);
  }
}
