import { z } from "zod";

/** Shared between the create/edit form and the API. */
export const monitorInputSchema = z.object({
  name: z.string().min(1).max(120),
  regionIds: z.array(z.number().int()).min(1, "Pick at least one region"),
  regionNames: z.array(z.string()).default([]),
  specialtyIds: z.array(z.number().int()).min(1, "Pick at least one specialty"),
  specialtyNames: z.array(z.string()).default([]),
  clinicIds: z.array(z.number().int()).default([]),
  clinicNames: z.array(z.string()).default([]),
  doctorIds: z.array(z.number().int()).default([]),
  doctorNames: z.array(z.string()).default([]),
  doctorNameFilter: z.string().max(120).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startHour: z.number().int().min(0).max(23).optional().nullable(),
  endHour: z.number().int().min(1).max(24).optional().nullable(),
  slotSearchType: z.enum(["Standard", "DiagnosticProcedure"]).default("Standard"),
  doctorLanguageId: z.number().int().optional().nullable(),
  intervalMinutes: z.number().int().min(5).max(24 * 60).default(15),
  active: z.boolean().default(true),
  messageLanguage: z.enum(["pl", "en"]).default("pl"),
  pushoverPriority: z.number().int().min(-2).max(2).default(0),
});

export type MonitorInput = z.infer<typeof monitorInputSchema>;
