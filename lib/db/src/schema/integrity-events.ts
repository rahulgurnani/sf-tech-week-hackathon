import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, jsonb, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionsTable } from "./sessions";
import { integrityEventType } from "./enums";

export const integrityEventsTable = pgTable("integrity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").unique(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  sequence: integer("sequence").notNull(),
  timestampMs: integer("timestamp_ms").notNull(),
  type: integrityEventType("type").notNull(),
  details: jsonb("details").$type<{ duration_ms?: number; character_count?: number }>().notNull().default({}),
}, (t) => [
  unique("integrity_sequence_unique").on(t.sessionId, t.sequence),
  check("integrity_sequence_positive", sql`${t.sequence} >= 1`),
  check("integrity_timestamp_window", sql`${t.timestampMs} BETWEEN 0 AND 360000`),
  check("integrity_details_object", sql`jsonb_typeof(${t.details}) = 'object'`),
]);
export const insertIntegrityEventSchema = createInsertSchema(integrityEventsTable).omit({ id: true });
export type IntegrityEvent = typeof integrityEventsTable.$inferSelect;
export type InsertIntegrityEvent = typeof integrityEventsTable.$inferInsert;
