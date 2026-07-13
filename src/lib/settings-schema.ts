import { z } from "zod";

const idValue = z.object({ id: z.string(), value: z.string() });

/** Shared by the settings API and backup import — unknown keys are stripped. */
export const settingsPatchSchema = z.object({
  medicoverUser: z.string().optional(),
  medicoverPass: z.string().optional(),
  pushoverToken: z.string().optional(),
  pushoverUser: z.string().optional(),
  pushoverDevice: z.string().optional(),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  gotifyUrl: z
    .string()
    .refine((s) => s === "" || /^https?:\/\//.test(s), "Must start with http(s)://")
    .transform((s) => s.replace(/\/+$/, ""))
    .optional(),
  gotifyToken: z.string().optional(),
  ntfyUrl: z
    .string()
    .refine((s) => s === "" || /^https?:\/\//.test(s), "Must start with http(s)://")
    .transform((s) => s.replace(/\/+$/, ""))
    .optional(),
  ntfyTopic: z.string().optional(),
  ntfyToken: z.string().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHours: z
    .string()
    .regex(/^\d{1,2}\s*-\s*\d{1,2}$/, 'Use "start-end", e.g. "23-7"')
    .optional(),
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

/** Values masked in API responses; "•••" round-trips as "unchanged". */
export const SECRET_SETTING_KEYS = [
  "medicoverPass",
  "pushoverToken",
  "telegramBotToken",
  "gotifyToken",
  "ntfyToken",
] as const;
