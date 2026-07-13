import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { SECRET_SETTING_KEYS, settingsPatchSchema } from "@/lib/settings-schema";
import { USER_AGENT } from "@/server/medicover/auth";
import {
  getSettingsWithMeta,
  saveSettings,
  type AppSettings,
} from "@/server/settings";

function redact(settings: AppSettings) {
  const out: AppSettings = { ...settings };
  for (const key of SECRET_SETTING_KEYS) {
    if (out[key]) out[key] = "•••";
  }
  return out;
}

export async function GET() {
  try {
    const { settings, locked } = await getSettingsWithMeta();
    return NextResponse.json({
      settings: redact(settings),
      locked,
      // Shown as the placeholder so users see what's sent by default.
      uaDefault: USER_AGENT,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const patch = settingsPatchSchema.parse(await req.json());
    // "•••" placeholders coming back from the form mean "unchanged".
    for (const key of SECRET_SETTING_KEYS) {
      if (patch[key] === "•••") delete patch[key];
    }
    await saveSettings(patch);
    const { settings, locked } = await getSettingsWithMeta();
    return NextResponse.json({ settings: redact(settings), locked, uaDefault: USER_AGENT });
  } catch (err) {
    return apiError(err);
  }
}
