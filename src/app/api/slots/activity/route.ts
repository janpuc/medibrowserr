import { NextResponse } from "next/server";
import { desc, eq, isNotNull, or } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/server/db";

export interface ActivityEvent {
  type: "found" | "taken" | "expired";
  at: number;
  slotId: number;
  monitorName: string | null;
  appointmentDate: string;
  doctorName: string | null;
  clinicName: string | null;
  specialtyName: string | null;
}

/**
 * Chronological log of slot lifecycle events, derived from found_slots:
 * every row yields a "found" event, gone rows additionally a taken/expired one.
 */
export async function GET(req: Request) {
  try {
    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 150), 500);
    const db = await getDb();
    const rows = await db
      .select({
        slot: schema.foundSlots,
        monitorName: schema.monitors.name,
      })
      .from(schema.foundSlots)
      .leftJoin(schema.monitors, eq(schema.foundSlots.monitorId, schema.monitors.id))
      .where(
        or(isNotNull(schema.foundSlots.firstSeenAt), isNotNull(schema.foundSlots.goneAt)),
      )
      .orderBy(desc(schema.foundSlots.lastSeenAt))
      .limit(limit * 2); // each row can yield two events

    const events: ActivityEvent[] = [];
    for (const { slot, monitorName } of rows) {
      const base = {
        slotId: slot.id,
        monitorName,
        appointmentDate: slot.appointmentDate,
        doctorName: slot.doctorName,
        clinicName: slot.clinicName,
        specialtyName: slot.specialtyName,
      };
      events.push({ type: "found", at: slot.firstSeenAt, ...base });
      if (slot.goneAt) {
        events.push({
          type: slot.goneReason === "taken" ? "taken" : "expired",
          at: slot.goneAt,
          ...base,
        });
      }
    }
    events.sort((a, b) => b.at - a.at);
    return NextResponse.json(events.slice(0, limit));
  } catch (err) {
    return apiError(err);
  }
}
