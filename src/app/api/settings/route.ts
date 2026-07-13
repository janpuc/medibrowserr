import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  getSettingsWithMeta,
  saveSettings,
  type AppSettings,
} from "@/server/settings";

const idValue = z.object({ id: z.string(), value: z.string() });

const patchSchema = z.object({
  medicoverUser: z.string().optional(),
  medicoverPass: z.string().optional(),
  pushoverToken: z.string().optional(),
  pushoverUser: z.string().optional(),
  pushoverDevice: z.string().optional(),
  defaultLanguage: z.enum(["pl", "en"]).optional(),
  defaultIntervalMinutes: z.number().int().min(5).max(24 * 60).optional(),
  defaultRegions: z.array(idValue).optional(),
  defaultClinics: z.array(idValue).optional(),
  appUrl: z
    .string()
    .refine((s) => s === "" || /^https?:\/\//.test(s), "Must start with http(s)://")
    .transform((s) => s.replace(/\/+$/, ""))
    .optional(),
  userAgent: z.string().max(300).optional(),
});

function redact(settings: AppSettings) {
  return {
    ...settings,
    medicoverPass: settings.medicoverPass ? "•••" : "",
    pushoverToken: settings.pushoverToken ? "•••" : "",
  };
}

export async function GET() {
  try {
    const { settings, locked } = await getSettingsWithMeta();
    return NextResponse.json({ settings: redact(settings), locked });
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
    await saveSettings(patch);
    const { settings, locked } = await getSettingsWithMeta();
    return NextResponse.json({ settings: redact(settings), locked });
  } catch (err) {
    return apiError(err);
  }
}
