import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionsTable } from "./sessions";

export const editorSnapshotsTable = pgTable("editor_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  timestampMs: integer("timestamp_ms").notNull(),
  content: text("content").notNull(),
}, (t) => [
  unique("snapshot_timestamp_unique").on(t.sessionId, t.timestampMs),
  check("snapshot_ten_second_slot", sql`${t.timestampMs} BETWEEN 0 AND 360000 AND ${t.timestampMs} % 10000 = 0`),
]);
export const insertEditorSnapshotSchema = createInsertSchema(editorSnapshotsTable).omit({ id: true });
export type EditorSnapshot = typeof editorSnapshotsTable.$inferSelect;
export type InsertEditorSnapshot = typeof editorSnapshotsTable.$inferInsert;
