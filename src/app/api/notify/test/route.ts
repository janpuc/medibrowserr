import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { SYSTEM_MESSAGES } from "@/server/notify/messages";
import { sendPushover } from "@/server/notify/pushover";

const bodySchema = z.object({ language: z.enum(["pl", "en"]).default("pl") });

export async function POST(req: Request) {
  try {
    const { language } = bodySchema.parse(await req.json().catch(() => ({})));
    const msg = SYSTEM_MESSAGES[language];
    const result = await sendPushover({ title: msg.testTitle, message: msg.testBody });
    if (!result.ok) {
      return NextResponse.json(
        { error: "pushover_failed", message: result.error },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
