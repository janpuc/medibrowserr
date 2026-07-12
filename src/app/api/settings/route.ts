import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSettings, saveSettings } from "@/server/settings";

const patchSchema = z.object({
  medicoverUser: z.string().optional(),
  medicoverPass: z.string().optional(),
  pushoverToken: z.string().optional(),
  pushoverUser: z.string().optional(),
  pushoverDevice: z.string().optional(),
  defaultLanguage: z.enum(["pl", "en"]).optional(),
  defaultIntervalMinutes: z.number().int().min(5).max(24 * 60).optional(),
  znanylekarzEnabled: z.boolean().optional(),
});

function redact(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    ...settings,
    medicoverPass: settings.medicoverPass ? "•••" : "",
    pushoverToken: settings.pushoverToken ? "•••" : "",
  };
}

export async function GET() {
  try {
    return NextResponse.json(redact(await getSettings()));
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const patch = patchSchema.parse(await req.json());
    // "•••" placeholders coming back from the form mean "unchanged".
    if (patch.medicoverPass === "•••") delete patch.medicoverPass;
    if (patch.pushoverToken === "•••") delete patch.pushoverToken;
    const saved = await saveSettings(patch);
    return NextResponse.json(redact(saved));
  } catch (err) {
    return apiError(err);
  }
}
