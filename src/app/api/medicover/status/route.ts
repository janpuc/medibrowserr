import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getPendingLogin } from "@/server/medicover/auth";
import { getMedicoverSession } from "@/server/settings";

export async function GET() {
  try {
    const session = await getMedicoverSession();
    const pending = getPendingLogin();
    return NextResponse.json({
      status: session.status,
      statusDetail: session.statusDetail?.replace(" [notified]", ""),
      profile: session.profile,
      pending: pending
        ? { kind: pending.kind, channelHint: pending.channelHint }
        : null,
    });
  } catch (err) {
    return apiError(err);
  }
}
