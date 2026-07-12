import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getSettings } from "@/server/settings";
import { enrichDoctor } from "@/server/znanylekarz";

/** GET /api/doctors/enrich?name=Jan+Kowalski → znanylekarz profile/photo. */
export async function GET(req: Request) {
  try {
    const name = new URL(req.url).searchParams.get("name")?.trim();
    if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
    const { znanylekarzEnabled } = await getSettings();
    if (!znanylekarzEnabled) {
      return NextResponse.json({
        searchUrl: `https://www.znanylekarz.pl/szukaj?q=${encodeURIComponent(name)}`,
      });
    }
    return NextResponse.json(await enrichDoctor(name));
  } catch (err) {
    return apiError(err);
  }
}
