import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  MfaInteractionRequired,
  passwordLogin,
  setPendingLogin,
} from "@/server/medicover/auth";
import { getPersonalData } from "@/server/medicover/client";
import {
  getMedicoverSession,
  getSettings,
  saveMedicoverSession,
  saveSettings,
} from "@/server/settings";

const bodySchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});

/**
 * Starts (or restarts) the Medicover connection. Outcomes:
 *  - { status: "connected" }
 *  - { status: "mfa_setup" }  → pick a channel (email/SMS) next
 *  - { status: "mfa_code" }   → a code is on its way; enter it next
 */
export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    if (body.username || body.password) {
      await saveSettings({
        ...(body.username ? { medicoverUser: body.username } : {}),
        ...(body.password && body.password !== "•••" ? { medicoverPass: body.password } : {}),
      });
    }
    const { medicoverUser, medicoverPass } = await getSettings();
    if (!medicoverUser || !medicoverPass) {
      return NextResponse.json(
        { error: "missing_credentials", message: "Enter your Medicover card number and password first." },
        { status: 400 },
      );
    }
    const session = await getMedicoverSession();
    try {
      const tokens = await passwordLogin(medicoverUser, medicoverPass, session.deviceId);
      await saveMedicoverSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        status: "connected",
        statusDetail: undefined,
      });
      setPendingLogin(null);
      // Grab the profile so the UI can greet the user by name.
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
      if (err instanceof MfaInteractionRequired) {
        setPendingLogin(err.state);
        await saveMedicoverSession({
          status: "action_required",
          statusDetail:
            err.state.kind === "mfa_setup"
              ? "One-time MFA setup required"
              : "Verification code required",
        });
        return NextResponse.json({
          status: err.state.kind,
          channelHint: err.state.channelHint,
        });
      }
      throw err;
    }
  } catch (err) {
    return apiError(err);
  }
}
