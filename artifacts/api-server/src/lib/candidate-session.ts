import { and, asc, eq, inArray, lt, ne, or, isNull, sql } from "drizzle-orm";
import {
  db, auditionsTable, auditionQuestionsTable, candidatesTable, sessionsTable,
  transcriptEntriesTable, type Candidate, type Session,
} from "@workspace/db";
import { elevenlabsGet, redactProviderError } from "./elevenlabs";
import { logger } from "./logger";
import { enqueueScoring } from "./scoring";

import { AUDITION_MS } from "../../../../shared/audition-config";
export const SESSION_MS = AUDITION_MS;
export const sessionLength = (session: Session) => session.durationSeconds * 1000;
export class RoomError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function sessionDto(session: Session) {
  return {
    id: session.id, candidate_id: session.candidateId,
    server_start_time: session.serverStartTime,
    deadline_at: new Date(session.serverStartTime.getTime() + sessionLength(session)),
    status: session.status, submitted_at: session.submittedAt,
    finish_reason: session.finishReason,
    server_now: new Date(), conversation_id: session.conversationId,
    transcript_status: session.transcriptStatus, transcript_error: session.transcriptError,
  };
}

export async function ownedSession(candidate: Candidate, id: string): Promise<Session> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RoomError(400, "Invalid session ID.");
  const [session] = await db.select().from(sessionsTable).where(and(
    eq(sessionsTable.id, id), eq(sessionsTable.candidateId, candidate.id),
  ));
  if (!session) throw new RoomError(404, "Session not found for this invite.");
  return session;
}

export async function roomDefinition(candidate: Candidate) {
  const [audition] = await db.select().from(auditionsTable).where(eq(auditionsTable.id, candidate.auditionId));
  const questions = await db.select().from(auditionQuestionsTable)
    .where(eq(auditionQuestionsTable.auditionId, audition.id)).orderBy(asc(auditionQuestionsTable.position));
  return {
    id: audition.id, company: audition.company, role: audition.role,
    job_description: audition.jobDescription, editor_language: audition.editorLanguage,
    duration_seconds: audition.durationSeconds, created_at: audition.createdAt,
    frozen_questions: questions.map(q => ({
      id: q.id, position: q.position, requirement: q.requirement, prompt: q.prompt,
      phase: q.phase, time_limit_seconds: q.timeLimitSeconds,
    })),
  };
}

/** Receipt grace is only for evidence captured before the effective end. */
export function validateEvidenceTime(session: Session, timestamp: number, now = Date.now()) {
  const elapsed = Math.max(0, now - session.serverStartTime.getTime());
  const end = session.submittedAt
    ? session.submittedAt.getTime() - session.serverStartTime.getTime() : sessionLength(session);
  if (timestamp > end || timestamp > elapsed + 1500 || elapsed - timestamp > 30_000 ||
      elapsed > sessionLength(session) + 30_000) {
    throw new RoomError(409, "Evidence is outside this session's capture window.");
  }
}

export async function finalizeSession(id: string, reason: "time_limit" | "finished_early" | "conversation_ended") {
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM sessions WHERE id = ${id} FOR UPDATE`);
    const [session] = await tx.select().from(sessionsTable).where(eq(sessionsTable.id, id));
    if (session.status === "Submitted") return session;
    const deadline = session.serverStartTime.getTime() + sessionLength(session);
    const now = Date.now();
    if (reason === "time_limit" && now < deadline) throw new RoomError(409, "The time limit has not been reached.");
    const expired = now >= deadline || reason === "time_limit";
    const [updated] = await tx.update(sessionsTable).set({
      status: "Submitted",
      submittedAt: new Date(expired ? deadline : Math.max(now, session.serverStartTime.getTime())),
      finishReason: expired ? "time_limit" : reason,
      transcriptStatus: session.conversationId ? "pending" : "not_started",
    }).where(eq(sessionsTable.id, id)).returning();
    await tx.update(candidatesTable).set({ status: "Submitted" }).where(eq(candidatesTable.id, session.candidateId));
    return updated;
  });
  await enqueueScoring(result.id);
  return result;
}

export async function syncTranscript(session: Session) {
  if (!session.conversationId) return;
  await db.update(sessionsTable).set({
    lastTranscriptAttemptAt: new Date(), transcriptAttempts: sql`${sessionsTable.transcriptAttempts} + 1`,
  }).where(eq(sessionsTable.id, session.id));
  try {
    const data = await elevenlabsGet(`/convai/conversations/${encodeURIComponent(session.conversationId)}`);
    const variables = data.conversation_initiation_client_data?.dynamic_variables;
    if (data.agent_id !== process.env.ELEVENLABS_AGENT_ID?.trim() ||
      (data.user_id !== session.id && variables?.audition_session_id !== session.id)) {
      throw new Error("Conversation does not belong to this audition session.");
    }
    if (!["done", "failed"].includes(data.status)) throw new Error("ElevenLabs is still processing the transcript.");
    if (!Array.isArray(data.transcript)) throw new Error("ElevenLabs returned no transcript array.");
    const offset = typeof data.metadata?.start_time_unix_secs === "number"
      ? Math.max(0, data.metadata.start_time_unix_secs * 1000 - session.serverStartTime.getTime())
      : session.conversationStartOffsetMs ?? 0;
    const cutoff = (session.submittedAt?.getTime() ?? session.serverStartTime.getTime() + sessionLength(session)) - session.serverStartTime.getTime();
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM sessions WHERE id = ${session.id} FOR UPDATE`);
      const appEntries = await tx.select().from(transcriptEntriesTable).where(and(
        eq(transcriptEntriesTable.sessionId, session.id), eq(transcriptEntriesTable.origin, "app"),
      ));
      const providerEntries = data.transcript.flatMap((entry: Record<string, unknown>) => {
        if (!["user", "agent"].includes(String(entry.role)) || typeof entry.message !== "string" ||
          typeof entry.time_in_call_secs !== "number") return [];
        const timestampMs = Math.max(0, Math.round(offset + entry.time_in_call_secs * 1000));
        if (timestampMs > cutoff) return [];
        const isAppMessage = Boolean(entry.contextual_update_info) ||
          (entry.role === "user" && (entry.source_medium === "text" || (entry.source_medium == null && appEntries.some(app =>
            app.text === entry.message && Math.abs(app.timestampMs - timestampMs) <= 10_000))));
        return [{
          sessionId: session.id, timestampMs,
          speaker: (entry.role === "user" ? "candidate" : "interviewer") as "candidate" | "interviewer",
          text: entry.message, isAppMessage, origin: "elevenlabs" as const,
          commandId: null, commandKind: null,
        }];
      });
      // Retain app provenance even when contextual updates aren't in the provider transcript.
      const entries = [...appEntries.map(({ id: _id, sequence: _sequence, ...entry }) => entry), ...providerEntries]
        .sort((a, b) => a.timestampMs - b.timestampMs);
      await tx.delete(transcriptEntriesTable).where(eq(transcriptEntriesTable.sessionId, session.id));
      if (entries.length) await tx.insert(transcriptEntriesTable).values(entries.map((entry, i) => ({ ...entry, sequence: i + 1 })));
      await tx.update(sessionsTable).set({ transcriptStatus: "ready", transcriptError: null })
        .where(eq(sessionsTable.id, session.id));
      await tx.execute(sql`UPDATE evaluations SET status = 'pending' WHERE session_id = ${session.id}
        AND status = 'ready' AND report->>'transcript_status_at_scoring' IS DISTINCT FROM 'ready'`);
    });
  } catch (error) {
    const message = redactProviderError(error instanceof Error ? error.message : "Transcript import failed.");
    await db.update(sessionsTable).set({ transcriptStatus: "error", transcriptError: message })
      .where(eq(sessionsTable.id, session.id));
    logger.warn({ session_id: session.id, error: message }, "Candidate transcript import pending retry");
  }
}

let busy = false;
export function startSessionMaintenance() {
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const expired = await db.select().from(sessionsTable).where(and(
        eq(sessionsTable.status, "In progress"), sql`${sessionsTable.serverStartTime} + ${sessionsTable.durationSeconds} * interval '1 second' <= now()`,
      ));
      for (const session of expired) await finalizeSession(session.id, "time_limit");
      const pending = await db.select().from(sessionsTable).where(and(
        or(eq(sessionsTable.status, "Submitted"), inArray(sessionsTable.transcriptStatus, ["pending", "error"])),
        ne(sessionsTable.transcriptStatus, "ready"),
        lt(sessionsTable.transcriptAttempts, 20),
        or(isNull(sessionsTable.lastTranscriptAttemptAt), lt(sessionsTable.lastTranscriptAttemptAt, new Date(Date.now() - 15_000))),
      )).limit(5);
      for (const session of pending) if (session.conversationId) await syncTranscript(session);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : "Maintenance failed" }, "Candidate session maintenance");
    } finally { busy = false; }
  };
  const timer = setInterval(() => void run(), 5000);
  timer.unref();
  void run();
}
