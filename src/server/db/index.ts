import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "sqlite://./data/medibrowserr.db";
  const url = raw.replace(/^sqlite:\/\//, "file:");
  // Make sure the directory exists for file-backed databases.
  if (url.startsWith("file:")) {
    const p = url.slice("file:".length).replace(/\?.*$/, "");
    fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  }
  return url;
}

/**
 * Idempotent schema bootstrap. Keeping DDL inline (instead of drizzle
 * migrations) means a fresh container starts with zero manual steps.
 */
const BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region_ids TEXT NOT NULL DEFAULT '[]',
  region_names TEXT NOT NULL DEFAULT '[]',
  specialty_ids TEXT NOT NULL DEFAULT '[]',
  specialty_names TEXT NOT NULL DEFAULT '[]',
  clinic_ids TEXT NOT NULL DEFAULT '[]',
  clinic_names TEXT NOT NULL DEFAULT '[]',
  doctor_ids TEXT NOT NULL DEFAULT '[]',
  doctor_names TEXT NOT NULL DEFAULT '[]',
  doctor_name_filter TEXT,
  start_date TEXT,
  end_date TEXT,
  start_hour INTEGER,
  end_hour INTEGER,
  slot_search_type TEXT NOT NULL DEFAULT 'Standard',
  doctor_language_id INTEGER,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  active INTEGER NOT NULL DEFAULT 1,
  message_language TEXT NOT NULL DEFAULT 'pl',
  pushover_priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  last_found_count INTEGER
);
CREATE TABLE IF NOT EXISTS found_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  dedupe_key TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  doctor_id TEXT,
  doctor_name TEXT,
  clinic_id TEXT,
  clinic_name TEXT,
  specialty_id TEXT,
  specialty_name TEXT,
  visit_type TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  notified_at INTEGER,
  gone_at INTEGER,
  gone_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS found_slots_monitor_dedupe
  ON found_slots (monitor_id, dedupe_key);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER,
  sent_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS coverage_services (
  service_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  verdict TEXT,
  referral_required INTEGER,
  discount INTEGER,
  fixed_payment INTEGER,
  volume_limit INTEGER,
  volume_used INTEGER,
  value_limit INTEGER,
  value_used INTEGER,
  product_name TEXT,
  plan_name TEXT,
  remarks TEXT,
  summary_json TEXT,
  catalog_at INTEGER NOT NULL,
  fetched_at INTEGER
);
CREATE INDEX IF NOT EXISTS coverage_services_verdict ON coverage_services (verdict);
CREATE INDEX IF NOT EXISTS coverage_services_name ON coverage_services (name);
`;

type GlobalWithDb = typeof globalThis & {
  __medibrowserrDb?: { client: Client; db: Db; ready: Promise<void> };
};

function init(): NonNullable<GlobalWithDb["__medibrowserrDb"]> {
  const g = globalThis as GlobalWithDb;
  if (!g.__medibrowserrDb) {
    const client = createClient({ url: databaseUrl() });
    const db = drizzle(client, { schema });
    const ready = (async () => {
      for (const stmt of BOOTSTRAP.split(";")) {
        const sql = stmt.trim();
        if (sql) await client.execute(sql);
      }
      // Additive migrations for databases created before these columns
      // existed (CREATE TABLE IF NOT EXISTS won't touch existing tables).
      for (const stmt of [
        "ALTER TABLE found_slots ADD COLUMN gone_at INTEGER",
        "ALTER TABLE found_slots ADD COLUMN gone_reason TEXT",
      ]) {
        await client.execute(stmt).catch(() => {}); // duplicate column → no-op
      }
    })();
    g.__medibrowserrDb = { client, db, ready };
  }
  return g.__medibrowserrDb;
}

/** Returns the drizzle instance after the schema bootstrap has completed. */
export async function getDb(): Promise<Db> {
  const { db, ready } = init();
  await ready;
  return db;
}

export { schema };
