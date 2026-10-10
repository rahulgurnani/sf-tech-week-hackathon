import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, check, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const auditionsTable = pgTable("auditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  company: text("company").notNull().default("Company"),
  role: text("role").notNull(),
  jobDescription: text("job_description").notNull(),
  editorLanguage: text("editor_language").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  durationSeconds: integer("duration_seconds").notNull().default(120),
  starterCode: text("starter_code").notNull().default(""),
  frozenSnapshot: jsonb("frozen_snapshot"),
  snapshotHash: text("snapshot_hash"),
  contactEmail: text("contact_email").notNull().default(""),
  approvalStatus: text("approval_status", { enum: ["draft", "approved"] }).notNull().default("approved"),
  draftQuestions: jsonb("draft_questions"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("audition_duration_range", sql`${t.durationSeconds} BETWEEN 60 AND 360`),
  check("audition_required_text", sql`length(trim(${t.role})) > 0 AND length(trim(${t.jobDescription})) > 0 AND length(trim(${t.editorLanguage})) > 0 AND length(${t.inviteToken}) > 0`),
]);
export const insertAuditionSchema = createInsertSchema(auditionsTable).omit({ id: true, createdAt: true });
export type Audition = typeof auditionsTable.$inferSelect;
export type InsertAudition = typeof auditionsTable.$inferInsert;
