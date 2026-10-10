import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, boolean, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { evaluationsTable } from "./evaluations";

export const requirementEvaluationsTable = pgTable("requirement_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationId: uuid("evaluation_id").notNull().references(() => evaluationsTable.id),
  requirement: text("requirement").notNull(),
  level: integer("level"),
  notCovered: boolean("not_covered").notNull().default(false),
  rationale: text("rationale").notNull(),
}, (t) => [
  unique("evaluation_requirement_unique").on(t.evaluationId, t.requirement),
  check("requirement_level_or_not_covered", sql`(${t.notCovered} AND ${t.level} IS NULL) OR (NOT ${t.notCovered} AND ${t.level} IS NOT NULL AND ${t.level} BETWEEN 1 AND 4)`),
  check("requirement_evaluation_text", sql`length(trim(${t.requirement})) > 0 AND length(trim(${t.rationale})) > 0`),
]);
export const insertRequirementEvaluationSchema = createInsertSchema(requirementEvaluationsTable).omit({ id: true });
export type RequirementEvaluation = typeof requirementEvaluationsTable.$inferSelect;
export type InsertRequirementEvaluation = typeof requirementEvaluationsTable.$inferInsert;
