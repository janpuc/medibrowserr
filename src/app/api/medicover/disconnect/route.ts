import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { setPendingLogin } from "@/server/medicover/auth";
import { saveMedicoverSession } from "@/server/settings";

export async function POST() {
  try {
    setPendingLogin(null);
    await saveMedicoverSession({
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      profile: undefined,
      status: "disconnected",
      statusDetail: "Disconnected manually",
    });
    return NextResponse.json({ status: "disconnected" });
  } catch (err) {
    return apiError(err);
  }
}
