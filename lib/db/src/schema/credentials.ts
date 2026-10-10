import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionsTable } from "./sessions";
import { evaluationsTable } from "./evaluations";

export const credentialsTable = pgTable("credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().unique().references(() => sessionsTable.id),
  evaluationId: uuid("evaluation_id").notNull().unique().references(() => evaluationsTable.id),
  signedToken: text("signed_token").notNull().unique(),
  sessionDataHash: text("session_data_hash").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("credential_sha256_hex", sql`${t.sessionDataHash} ~ '^[0-9a-f]{64}$'`),
  check("credential_token_required", sql`length(${t.signedToken}) > 0`),
]);
export const insertCredentialSchema = createInsertSchema(credentialsTable).omit({ id: true, issuedAt: true });
export type Credential = typeof credentialsTable.$inferSelect;
export type InsertCredential = typeof credentialsTable.$inferInsert;
