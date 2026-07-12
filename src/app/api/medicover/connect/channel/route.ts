import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPendingLogin, setPendingLogin, submitMfaChannel } from "@/server/medicover/auth";

const bodySchema = z.object({
  channel: z.enum(["Email", "SMS"]),
  email: z.string().email().optional(),
  phonePrefix: z.string().optional(),
  phone: z.string().optional(),
});

/** Step 2 of MFA setup: choose where the verification code goes. */
export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const pending = getPendingLogin();
    if (!pending || pending.kind !== "mfa_setup") {
      return NextResponse.json(
        { error: "no_pending_setup", message: "No MFA setup in progress — start connecting again." },
        { status: 409 },
      );
    }
    const next = await submitMfaChannel(pending, body);
    setPendingLogin(next);
    return NextResponse.json({ status: "mfa_code" });
  } catch (err) {
    return apiError(err);
  }
}
