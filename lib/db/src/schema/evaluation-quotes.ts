import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, boolean, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { requirementEvaluationsTable } from "./requirement-evaluations";

export const evaluationQuotesTable = pgTable("evaluation_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  requirementEvaluationId: uuid("requirement_evaluation_id").notNull().references(() => requirementEvaluationsTable.id),
  timestampMs: integer("timestamp_ms"),
  source: text("source", { enum: ["code", "transcript"] }).notNull().default("transcript"),
  verified: boolean("verified").notNull().default(true),
  quote: text("quote").notNull(),
}, (t) => [
  index("evaluation_quotes_requirement_idx").on(t.requirementEvaluationId),
  check("quote_timestamp_window", sql`${t.timestampMs} BETWEEN 0 AND 360000`),
  check("quote_not_empty", sql`length(trim(${t.quote})) > 0`),
]);
export const insertEvaluationQuoteSchema = createInsertSchema(evaluationQuotesTable).omit({ id: true });
export type EvaluationQuote = typeof evaluationQuotesTable.$inferSelect;
export type InsertEvaluationQuote = typeof evaluationQuotesTable.$inferInsert;
