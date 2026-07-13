import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { searchSlots } from "@/server/medicover/client";
import { applyDoctorNameFilter } from "@/server/medicover/slots";

const bodySchema = z.object({
  regionIds: z.array(z.number().int()).min(1),
  specialtyIds: z.array(z.number().int()).min(1),
  clinicIds: z.array(z.number().int()).default([]),
  doctorIds: z.array(z.number().int()).default([]),
  doctorNameFilter: z.string().optional().nullable(),
  doctorLanguageId: z.number().int().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  startHour: z.number().int().optional().nullable(),
  endHour: z.number().int().optional().nullable(),
  slotSearchType: z.enum(["Standard", "DiagnosticProcedure"]).default("Standard"),
});

/** Dry-runs a monitor's search so the form can show what it would catch. */
export async function POST(req: Request) {
  try {
    const p = bodySchema.parse(await req.json());
    const slots = applyDoctorNameFilter(
      await searchSlots({
        regionIds: p.regionIds,
        specialtyIds: p.specialtyIds,
        clinicIds: p.clinicIds,
        doctorIds: p.doctorIds,
        doctorLanguageId: p.doctorLanguageId ?? undefined,
        startDate: p.startDate ?? undefined,
        endDate: p.endDate ?? undefined,
        startHour: p.startHour ?? undefined,
        endHour: p.endHour ?? undefined,
        slotSearchType: p.slotSearchType,
      }),
      p.doctorNameFilter ?? null,
    );
    return NextResponse.json({
      count: slots.length,
      sample: slots.slice(0, 5).map((s) => ({
        appointmentDate: s.appointmentDate,
        doctorName: s.doctor?.name ?? null,
        clinicName: s.clinic?.name ?? null,
        specialtyName: s.specialty?.name ?? null,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
