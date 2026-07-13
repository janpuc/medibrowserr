import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

export interface IdValue {
  id: string;
  value: string;
}

/** Everything configurable from the Settings page, stored as one kv row. */
export interface AppSettings {
  medicoverUser: string;
  medicoverPass: string;
  pushoverToken: string;
  pushoverUser: string;
  pushoverDevice: string;
  /** Default notification template language for new monitors. */
  defaultLanguage: "pl" | "en";
  /** Default polling interval for new monitors, minutes. */
  defaultIntervalMinutes: number;
  /** Regions preselected in new monitors ("where do I live"). */
  defaultRegions: IdValue[];
  /** Clinics preselected in new monitors ("my usual clinics"). */
  defaultClinics: IdValue[];
  /** Public URL of this app — notification links point here when set. */
  appUrl: string;
  /** Overrides the browser User-Agent sent to Medicover (empty = built-in). */
  userAgent: string;
}

/** Persisted Medicover session — survives restarts so logins stay rare. */
export interface MedicoverSession {
  deviceId: string;
  accessToken?: string;
  refreshToken?: string;
  /** Unix seconds when accessToken expires. */
  expiresAt?: number;
  /** Human-readable connection state for the UI. */
  status: "disconnected" | "connected" | "action_required";
  statusDetail?: string;
  profile?: { firstName?: string; lastName?: string; mrn?: number };
}

const DEFAULTS: AppSettings = {
  medicoverUser: "",
  medicoverPass: "",
  pushoverToken: "",
  pushoverUser: "",
  pushoverDevice: "",
  defaultLanguage: "pl",
  defaultIntervalMinutes: 15,
  defaultRegions: [],
  defaultClinics: [],
  appUrl: "",
  userAgent: "",
};

const parseIdList = (raw: string): IdValue[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    // Names get resolved against the live dictionary in the UI.
    .map((id) => ({ id, value: id }));

/**
 * Settings coming from env vars. These OVERRIDE anything stored in the DB
 * and show up grayed-out in the GUI (the `locked` list below).
 */
function envSettings(): Partial<AppSettings> {
  const env: Partial<AppSettings> = {};
  if (process.env.MEDICOVER_USER) env.medicoverUser = process.env.MEDICOVER_USER;
  if (process.env.MEDICOVER_PASS) env.medicoverPass = process.env.MEDICOVER_PASS;
  if (process.env.PUSHOVER_TOKEN) env.pushoverToken = process.env.PUSHOVER_TOKEN;
  if (process.env.PUSHOVER_USER) env.pushoverUser = process.env.PUSHOVER_USER;
  if (process.env.PUSHOVER_DEVICE) env.pushoverDevice = process.env.PUSHOVER_DEVICE;
  const lang = process.env.MEDIBROWSERR_DEFAULT_LANGUAGE;
  if (lang === "pl" || lang === "en") env.defaultLanguage = lang;
  const interval = Number(process.env.MEDIBROWSERR_DEFAULT_INTERVAL);
  if (Number.isFinite(interval) && interval >= 5) env.defaultIntervalMinutes = interval;
  if (process.env.MEDIBROWSERR_DEFAULT_REGION_IDS) {
    env.defaultRegions = parseIdList(process.env.MEDIBROWSERR_DEFAULT_REGION_IDS);
  }
  if (process.env.MEDIBROWSERR_DEFAULT_CLINIC_IDS) {
    env.defaultClinics = parseIdList(process.env.MEDIBROWSERR_DEFAULT_CLINIC_IDS);
  }
  if (process.env.MEDIBROWSERR_URL) {
    env.appUrl = process.env.MEDIBROWSERR_URL.replace(/\/+$/, "");
  }
  if (process.env.MEDIBROWSERR_USER_AGENT) {
    env.userAgent = process.env.MEDIBROWSERR_USER_AGENT;
  }
  return env;
}

async function readKey<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key));
  if (!rows.length) return undefined;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return undefined;
  }
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key, value: JSON.stringify(value), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: JSON.stringify(value), updatedAt: Date.now() },
    });
}

export async function getSettings(): Promise<AppSettings> {
  const stored = (await readKey<Partial<AppSettings>>("app")) ?? {};
  return { ...DEFAULTS, ...stored, ...envSettings() };
}

/** Settings plus the list of keys pinned by env vars (read-only in the GUI). */
export async function getSettingsWithMeta(): Promise<{
  settings: AppSettings;
  locked: (keyof AppSettings)[];
}> {
  return {
    settings: await getSettings(),
    locked: Object.keys(envSettings()) as (keyof AppSettings)[],
  };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  // Env-pinned keys are not editable.
  for (const key of Object.keys(envSettings()) as (keyof AppSettings)[]) {
    delete patch[key];
  }
  const stored = (await readKey<Partial<AppSettings>>("app")) ?? {};
  await writeKey("app", { ...stored, ...patch });
  return getSettings();
}

export async function getMedicoverSession(): Promise<MedicoverSession> {
  const stored = await readKey<MedicoverSession>("medicoverSession");
  if (stored?.deviceId) return stored;
  const fresh: MedicoverSession = {
    deviceId: crypto.randomUUID(),
    status: "disconnected",
  };
  await writeKey("medicoverSession", fresh);
  return fresh;
}

export async function saveMedicoverSession(
  patch: Partial<MedicoverSession>,
): Promise<MedicoverSession> {
  const current = await getMedicoverSession();
  const merged = { ...current, ...patch };
  await writeKey("medicoverSession", merged);
  return merged;
}
