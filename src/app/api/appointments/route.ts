import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getPersonAppointments } from "@/server/medicover/client";

/** My planned (or past) visits straight from Medicover. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state") === "Realized" ? "Realized" : "Planned";
    return NextResponse.json(await getPersonAppointments(state));
  } catch (err) {
    return apiError(err);
  }
}
