import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import type { Slot } from "@/server/medicover/types";
import { buildNotification } from "@/server/notify/messages";
import { dispatchNotification } from "@/server/notify/dispatch";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  language: z.enum(["pl", "en"]).default("pl"),
  template: z.string().max(300).optional().nullable(),
  priority: z.number().int().min(-2).max(2).default(0),
  /** false = just render the preview; true = actually send it. */
  send: z.boolean().default(false),
});

/** Two representative slots so previews/tests look like the real thing. */
const SAMPLE_SLOTS: Slot[] = [
  {
    appointmentDate: sampleDate(1, "09:30:00"),
    doctor: { id: "1", name: "Anna Nowakowska" },
    clinic: { id: "1", name: "Centrum Medicover Podgórska" },
    specialty: { id: "1", name: "Kardiolog dorośli" },
    visitType: "Center",
  },
  {
    appointmentDate: sampleDate(2, "14:15:00"),
    doctor: { id: "2", name: "Piotr Wiśniewski" },
    clinic: { id: "2", name: "Centrum Medicover Czerwone Maki" },
    specialty: { id: "1", name: "Kardiolog dorośli" },
    visitType: "Center",
  },
];

function sampleDate(daysAhead: number, time: string): string {
  const d = new Date(Date.now() + daysAhead * 86400e3);
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

/**
 * Renders (and optionally sends) the exact notification a monitor would
 * produce, using sample slots — lets the user see and verify the message
 * before saving the monitor.
 */
export async function POST(req: Request) {
  try {
    const input = bodySchema.parse(await req.json());
    const { title, message } = buildNotification(
      input.name,
      SAMPLE_SLOTS[0].specialty?.name,
      SAMPLE_SLOTS,
      input.language,
      input.template,
    );
    if (!input.send) {
      return NextResponse.json({ title, message, sent: [], errors: [] });
    }
    const result = await dispatchNotification({
      title: `[TEST] ${title}`,
      message,
      priority: input.priority,
    });
    if (result.unconfigured) {
      return NextResponse.json(
        { error: "unconfigured", message: "No notification channel is configured yet — set one up in Settings." },
        { status: 400 },
      );
    }
    return NextResponse.json({ title, message, ...result });
  } catch (err) {
    return apiError(err);
  }
}
