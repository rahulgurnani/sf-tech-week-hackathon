import { sql } from "drizzle-orm";
import { pgTable, uuid, timestamp, text, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { candidatesTable } from "./candidates";
import { sessionStatus } from "./enums";

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id").notNull().unique().references(() => candidatesTable.id),
  serverStartTime: timestamp("server_start_time", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  finishReason: text("finish_reason", { enum: ["time_limit", "finished_early"] }),
  status: sessionStatus("status").notNull().default("In progress"),
}, (t) => [
  check("session_submission_consistent", sql`(${t.status} = 'In progress' AND ${t.submittedAt} IS NULL AND ${t.finishReason} IS NULL) OR (${t.status} = 'Submitted' AND ${t.submittedAt} IS NOT NULL AND ${t.finishReason} IS NOT NULL AND ${t.finishReason} IN ('time_limit', 'finished_early'))`),
  check("session_submission_window", sql`${t.submittedAt} IS NULL OR (${t.submittedAt} >= ${t.serverStartTime} AND ${t.submittedAt} <= ${t.serverStartTime} + interval '6 minutes')`),
]);
export const insertSessionSchema = createInsertSchema(sessionsTable).pick({ candidateId: true });
export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
