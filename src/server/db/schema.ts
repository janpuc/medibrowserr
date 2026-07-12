import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Simple key/value store for app settings and the persisted Medicover
 * session (tokens, device id). Values are JSON-encoded.
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** A saved search that runs on an interval and notifies about new slots. */
export const monitors = sqliteTable("monitors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** JSON arrays of numeric ids picked from the Medicover dictionaries. */
  regionIds: text("region_ids").notNull().default("[]"),
  regionNames: text("region_names").notNull().default("[]"),
  specialtyIds: text("specialty_ids").notNull().default("[]"),
  specialtyNames: text("specialty_names").notNull().default("[]"),
  clinicIds: text("clinic_ids").notNull().default("[]"),
  clinicNames: text("clinic_names").notNull().default("[]"),
  doctorIds: text("doctor_ids").notNull().default("[]"),
  doctorNames: text("doctor_names").notNull().default("[]"),
  /** Case-insensitive substring match applied to result doctor names. */
  doctorNameFilter: text("doctor_name_filter"),
  /** ISO dates limiting the search window (start defaults to today). */
  startDate: text("start_date"),
  endDate: text("end_date"),
  /** Hour-of-day window, e.g. only slots between 07 and 15. */
  startHour: integer("start_hour"),
  endHour: integer("end_hour"),
  /** "Standard" (consultations) or "DiagnosticProcedure". */
  slotSearchType: text("slot_search_type").notNull().default("Standard"),
  /** Medicover doctor-language dictionary id (4=PL, 6=EN, 60=UA). */
  doctorLanguageId: integer("doctor_language_id"),
  intervalMinutes: integer("interval_minutes").notNull().default(15),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** Notification template language: "pl" | "en". */
  messageLanguage: text("message_language").notNull().default("pl"),
  /** Pushover priority -2..2 (see https://pushover.net/api#priority). */
  pushoverPriority: integer("pushover_priority").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  nextRunAt: integer("next_run_at"),
  lastRunAt: integer("last_run_at"),
  /** "ok" | "error" | null (never ran). */
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  /** Slots seen in the most recent run (for the dashboard count). */
  lastFoundCount: integer("last_found_count"),
});

/** Every distinct slot a monitor has ever seen (dedupe + feed). */
export const foundSlots = sqliteTable(
  "found_slots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id").notNull(),
    /** Hash of date+doctor+clinic+specialty that identifies a slot. */
    dedupeKey: text("dedupe_key").notNull(),
    /** Local-time ISO string exactly as the API returns it. */
    appointmentDate: text("appointment_date").notNull(),
    doctorId: text("doctor_id"),
    doctorName: text("doctor_name"),
    clinicId: text("clinic_id"),
    clinicName: text("clinic_name"),
    specialtyId: text("specialty_id"),
    specialtyName: text("specialty_name"),
    visitType: text("visit_type"),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    notifiedAt: integer("notified_at"),
  },
  (t) => [uniqueIndex("found_slots_monitor_dedupe").on(t.monitorId, t.dedupeKey)],
);

/** Log of outgoing notifications (Pushover). */
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monitorId: integer("monitor_id"),
  sentAt: integer("sent_at").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(), // "sent" | "error"
  error: text("error"),
});

/** Small cache for external lookups (Medicover dictionaries, znanylekarz). */
export const dictCache = sqliteTable("dict_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});
