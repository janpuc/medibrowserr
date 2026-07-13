import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { SYSTEM_MESSAGES } from "@/server/notify/messages";
import {
  configuredChannels,
  dispatchNotification,
  type ChannelName,
} from "@/server/notify/dispatch";

const bodySchema = z.object({
  language: z.enum(["pl", "en"]).default("pl"),
  /** Test a single channel; omit to test all configured ones. */
  channel: z.enum(["pushover", "telegram", "gotify", "ntfy"]).optional(),
});

export async function POST(req: Request) {
  try {
    const { language, channel } = bodySchema.parse(await req.json().catch(() => ({})));
    if (channel) {
      const configured = await configuredChannels();
      if (!configured.includes(channel)) {
        return NextResponse.json(
          { error: "unconfigured", message: `${channel} is not fully configured — save its credentials first.` },
          { status: 400 },
        );
      }
    }
    const msg = SYSTEM_MESSAGES[language];
    const result = await dispatchNotification(
      { title: msg.testTitle, message: msg.testBody },
      channel ? { only: [channel as ChannelName] } : {},
    );
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
