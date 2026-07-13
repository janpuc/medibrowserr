import "server-only";
import { writeKey } from "@/server/settings";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { SeedStatus } from "./seeder";

export { getMedicoverSession } from "@/server/settings";

const KEY = "coverageSeed";

export async function readSeedState(): Promise<SeedStatus | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, KEY));
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].value) as SeedStatus;
  } catch {
    return null;
  }
}

export async function writeSeedState(status: SeedStatus): Promise<void> {
  await writeKey(KEY, status);
}
