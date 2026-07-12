import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

/** Everything configurable from the Settings page, stored as one kv row each. */
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
  /** Enrich doctor cards with znanylekarz.pl profile/photo lookups. */
  znanylekarzEnabled: boolean;
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
  znanylekarzEnabled: true,
};

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

/** Env vars seed the store on first boot; values saved via the UI win. */
export async function getSettings(): Promise<AppSettings> {
  const stored = (await readKey<Partial<AppSettings>>("app")) ?? {};
  const envSeed: Partial<AppSettings> = {};
  if (process.env.MEDICOVER_USER) envSeed.medicoverUser = process.env.MEDICOVER_USER;
  if (process.env.MEDICOVER_PASS) envSeed.medicoverPass = process.env.MEDICOVER_PASS;
  if (process.env.PUSHOVER_TOKEN) envSeed.pushoverToken = process.env.PUSHOVER_TOKEN;
  if (process.env.PUSHOVER_USER) envSeed.pushoverUser = process.env.PUSHOVER_USER;
  return { ...DEFAULTS, ...envSeed, ...stored };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const stored = (await readKey<Partial<AppSettings>>("app")) ?? {};
  const merged = { ...stored, ...patch };
  await writeKey("app", merged);
  return { ...DEFAULTS, ...merged };
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
