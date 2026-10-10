import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { auditionsTable } from "./auditions";
import { candidateStatus } from "./enums";

export const candidatesTable = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditionId: uuid("audition_id").notNull().references(() => auditionsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  status: candidateStatus("status").notNull().default("Invited"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("candidate_audition_email_unique").on(t.auditionId, t.email),
  check("candidate_required_text", sql`length(trim(${t.name})) > 0 AND length(trim(${t.email})) > 0`),
]);
export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({ id: true, createdAt: true, status: true });
export type Candidate = typeof candidatesTable.$inferSelect;
export type InsertCandidate = typeof candidatesTable.$inferInsert;
