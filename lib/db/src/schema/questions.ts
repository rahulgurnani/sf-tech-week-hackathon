import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { auditionsTable } from "./auditions";
import { auditionPhase } from "./enums";

export const auditionQuestionsTable = pgTable("audition_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditionId: uuid("audition_id").notNull().references(() => auditionsTable.id),
  position: integer("position").notNull(),
  requirement: text("requirement").notNull(),
  prompt: text("prompt").notNull(),
  phase: auditionPhase("phase").notNull(),
  timeLimitSeconds: integer("time_limit_seconds").notNull(),
}, (t) => [
  unique("question_position_unique").on(t.auditionId, t.position),
  check("question_position_positive", sql`${t.position} >= 1`),
  check("question_time_limit", sql`${t.timeLimitSeconds} BETWEEN 1 AND 180`),
  check("question_required_text", sql`length(trim(${t.requirement})) > 0 AND length(trim(${t.prompt})) > 0`),
]);
export const insertAuditionQuestionSchema = createInsertSchema(auditionQuestionsTable).omit({ id: true });
export type AuditionQuestion = typeof auditionQuestionsTable.$inferSelect;
export type InsertAuditionQuestion = typeof auditionQuestionsTable.$inferInsert;
