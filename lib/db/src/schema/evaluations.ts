import { sql } from "drizzle-orm";
import { pgTable, uuid, real, text, timestamp, check, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionsTable } from "./sessions";

export const evaluationsTable = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().unique().references(() => sessionsTable.id),
  overallScore: real("overall_score"),
  status: text("status", { enum: ["pending", "scoring", "ready", "error"] }).notNull().default("pending"),
  report: jsonb("report"),
  error: text("error"),
  spokenSummaryText: text("spoken_summary_text").notNull(),
  spokenSummaryAudioFile: text("spoken_summary_audio_file"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("evaluation_score_range", sql`${t.overallScore} IS NULL OR ${t.overallScore} BETWEEN 1 AND 4`),
  check("evaluation_summary_required", sql`length(trim(${t.spokenSummaryText})) > 0`),
]);
export const insertEvaluationSchema = createInsertSchema(evaluationsTable).omit({ id: true, createdAt: true });
export type Evaluation = typeof evaluationsTable.$inferSelect;
export type InsertEvaluation = typeof evaluationsTable.$inferInsert;
