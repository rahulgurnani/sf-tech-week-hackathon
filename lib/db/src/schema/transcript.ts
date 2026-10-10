import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionsTable } from "./sessions";
import { transcriptSpeaker } from "./enums";

export const transcriptEntriesTable = pgTable("transcript_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  sequence: integer("sequence").notNull(),
  timestampMs: integer("timestamp_ms").notNull(),
  speaker: transcriptSpeaker("speaker").notNull(),
  text: text("text").notNull(),
}, (t) => [
  unique("transcript_sequence_unique").on(t.sessionId, t.sequence),
  check("transcript_sequence_positive", sql`${t.sequence} >= 1`),
  check("transcript_timestamp_window", sql`${t.timestampMs} BETWEEN 0 AND 360000`),
]);
export const insertTranscriptEntrySchema = createInsertSchema(transcriptEntriesTable).omit({ id: true });
export type TranscriptEntry = typeof transcriptEntriesTable.$inferSelect;
export type InsertTranscriptEntry = typeof transcriptEntriesTable.$inferInsert;
