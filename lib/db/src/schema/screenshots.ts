import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sessionsTable } from "./sessions";

export const screenshotsTable = pgTable("screenshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  timestampMs: integer("timestamp_ms").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
}, (t) => [
  unique("screenshot_timestamp_unique").on(t.sessionId, t.timestampMs),
  check("screenshot_timestamp_window", sql`${t.timestampMs} BETWEEN 0 AND 360000`),
  check("screenshot_file_metadata", sql`length(${t.filePath}) > 0 AND ${t.mimeType} IN ('image/png', 'image/jpeg', 'image/webp')`),
]);
export const insertScreenshotSchema = createInsertSchema(screenshotsTable).omit({ id: true });
export type Screenshot = typeof screenshotsTable.$inferSelect;
export type InsertScreenshot = typeof screenshotsTable.$inferInsert;
