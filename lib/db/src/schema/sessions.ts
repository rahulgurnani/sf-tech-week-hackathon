import { sql } from "drizzle-orm";
import { pgTable, uuid, timestamp, text, integer, check, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { candidatesTable } from "./candidates";
import { sessionStatus } from "./enums";

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id").notNull().unique().references(() => candidatesTable.id),
  durationSeconds: integer("duration_seconds").notNull().default(360),
  behavioralSeconds: integer("behavioral_seconds").notNull().default(180),
  questionSnapshot: jsonb("question_snapshot"),
  serverStartTime: timestamp("server_start_time", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  finishReason: text("finish_reason", { enum: ["time_limit", "finished_early", "conversation_ended"] }),
  status: sessionStatus("status").notNull().default("In progress"),
  conversationId: text("conversation_id").unique(),
  voiceIssuedAt: timestamp("voice_issued_at", { withTimezone: true }),
  finalEditorContent: text("final_editor_content"),
  conversationStartOffsetMs: integer("conversation_start_offset_ms"),
  transcriptStatus: text("transcript_status", { enum: ["not_started", "pending", "ready", "error"] }).notNull().default("not_started"),
  transcriptError: text("transcript_error"),
  transcriptAttempts: integer("transcript_attempts").notNull().default(0),
  lastTranscriptAttemptAt: timestamp("last_transcript_attempt_at", { withTimezone: true }),
}, (t) => [
  check("session_submission_consistent", sql`(${t.status} = 'In progress' AND ${t.submittedAt} IS NULL AND ${t.finishReason} IS NULL) OR (${t.status} = 'Submitted' AND ${t.submittedAt} IS NOT NULL AND ${t.finishReason} IS NOT NULL AND ${t.finishReason} IN ('time_limit', 'finished_early', 'conversation_ended'))`),
  check("session_submission_window", sql`${t.submittedAt} IS NULL OR (${t.submittedAt} >= ${t.serverStartTime} AND ${t.submittedAt} <= ${t.serverStartTime} + ${t.durationSeconds} * interval '1 second')`),
]);
export const insertSessionSchema = createInsertSchema(sessionsTable).pick({ candidateId: true });
export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
