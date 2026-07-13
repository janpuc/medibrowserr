import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { SYSTEM_MESSAGES } from "@/server/notify/messages";
import { dispatchNotification } from "@/server/notify/dispatch";

const bodySchema = z.object({ language: z.enum(["pl", "en"]).default("pl") });

/** Sends a test message to every configured channel; reports per channel. */
export async function POST(req: Request) {
  try {
    const { language } = bodySchema.parse(await req.json().catch(() => ({})));
    const msg = SYSTEM_MESSAGES[language];
    const result = await dispatchNotification({
      title: msg.testTitle,
      message: msg.testBody,
    });
    if (result.unconfigured) {
      return NextResponse.json(
        { error: "unconfigured", message: "No notification channel is configured yet." },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
