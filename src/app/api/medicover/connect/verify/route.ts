import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPendingLogin, setPendingLogin, submitMfaCode } from "@/server/medicover/auth";
import { getPersonalData } from "@/server/medicover/client";
import { saveMedicoverSession } from "@/server/settings";

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Final MFA step: submit the 6-digit code, persist tokens. */
export async function POST(req: Request) {
  try {
    const { code } = bodySchema.parse(await req.json());
    const pending = getPendingLogin();
    if (!pending) {
      return NextResponse.json(
        { error: "no_pending_login", message: "No login in progress — start connecting again." },
        { status: 409 },
      );
    }
    const tokens = await submitMfaCode(pending, code);
    setPendingLogin(null);
    await saveMedicoverSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      status: "connected",
      statusDetail: undefined,
    });
    try {
      const profile = await getPersonalData();
      await saveMedicoverSession({
        profile: { firstName: profile.firstName, lastName: profile.lastName, mrn: profile.mrn },
      });
    } catch {
      /* non-fatal */
    }
    return NextResponse.json({ status: "connected" });
  } catch (err) {
    return apiError(err);
  }
}
