import express, { Router, type IRouter } from "express";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db, auditionsTable, candidatesTable, sessionsTable, editorSnapshotsTable, screenshotsTable,
  integrityEventsTable, transcriptEntriesTable, type Candidate,
} from "@workspace/db";
import {
  GetCandidateRoomResponse, GetCandidateSessionResponse, StartCandidateRoomBody,
  GetCandidateVoiceResponse, BindCandidateConversationBody, SaveCandidateSnapshotBody,
  SaveCandidateIntegrityBody, SaveCandidateCommandBody, SubmitCandidateRoomBody,
} from "@workspace/api-zod";
import {
  RoomError, roomDefinition, ownedSession, sessionDto, validateEvidenceTime,
  finalizeSession, SESSION_MS, sessionLength,
} from "../lib/candidate-session";
import { elevenlabsGet, redactProviderError } from "../lib/elevenlabs";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";
import { AUDITION_TIMING, DEMO_STARTER } from "../../../../shared/audition-config";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const rates = new Map<string, { count: number; until: number }>();

router.use("/candidate", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    res.status(401).json({ error: "invalid_invite", message: "A valid candidate invite is required." }); return;
  }
  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.inviteToken, token));
  if (!candidate) { res.status(401).json({ error: "invalid_invite", message: "This invite is invalid." }); return; }
  const now = Date.now();
  const limit = rates.get(candidate.id);
  if (!limit || limit.until < now) rates.set(candidate.id, { count: 1, until: now + 60_000 });
  else if (++limit.count > 120) { res.status(429).json({ error: "rate_limit", message: "Too many requests. Try again shortly." }); return; }
  if (rates.size > 1000) for (const [id, value] of rates) if (value.until < now) rates.delete(id);
  res.locals.candidate = candidate;
  next();
});

router.get("/candidate/room", async (_req, res) => {
  const candidate: Candidate = res.locals.candidate;
  let [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.candidateId, candidate.id));
  if (session?.status === "In progress" && Date.now() >= session.serverStartTime.getTime() + sessionLength(session)) {
    session = await finalizeSession(session.id, "time_limit");
  }
  const [latest] = session ? await db.select().from(editorSnapshotsTable)
    .where(eq(editorSnapshotsTable.sessionId, session.id)).orderBy(desc(editorSnapshotsTable.timestampMs)).limit(1) : [];
  const [screenshots] = session ? await db.select({ count: count() }).from(screenshotsTable)
    .where(eq(screenshotsTable.sessionId, session.id)) : [];
  res.json(GetCandidateRoomResponse.parse({
    audition: await roomDefinition(candidate),
    candidate: { id: candidate.id, audition_id: candidate.auditionId, name: candidate.name,
      email: candidate.email, status: session?.status ?? candidate.status, created_at: candidate.createdAt },
    session: session ? sessionDto(session) : null,
    screenshot_count: screenshots?.count ?? 0, last_snapshot_ms: latest?.timestampMs ?? null,
    editor_content: session?.finalEditorContent ?? latest?.content ??
      (await db.select().from(auditionsTable).where(eq(auditionsTable.id, candidate.auditionId)))[0].starterCode,
  }));
});

router.post("/candidate/start", async (req, res) => {
  const body = StartCandidateRoomBody.parse({
    ...req.body,
    candidate_name: typeof req.body?.candidate_name === "string" ? req.body.candidate_name.trim() : req.body?.candidate_name,
    candidate_email: typeof req.body?.candidate_email === "string" ? req.body.candidate_email.trim() : req.body?.candidate_email,
  });
  const candidate: Candidate = res.locals.candidate;
  const session = await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM candidates WHERE id = ${candidate.id} FOR UPDATE`);
    const [existing] = await tx.select().from(sessionsTable).where(eq(sessionsTable.candidateId, candidate.id));
    if (existing) return existing; // Never reset an existing start time.
    await tx.update(candidatesTable).set({
      name: body.candidate_name.trim(), email: body.candidate_email.trim().toLowerCase(), status: "In progress",
    }).where(eq(candidatesTable.id, candidate.id));
    const [audition] = await tx.select().from(auditionsTable).where(eq(auditionsTable.id, candidate.auditionId));
    const [created] = await tx.insert(sessionsTable).values({
      candidateId: candidate.id, durationSeconds: audition.durationSeconds,
      behavioralSeconds: AUDITION_TIMING.behavioralSeconds,
      questionSnapshot: audition.frozenSnapshot,
    }).returning();
    return created;
  });
  res.json(GetCandidateSessionResponse.parse(sessionDto(session)));
});

router.get("/candidate/session/:sessionId", async (req, res) => {
  let session = await ownedSession(res.locals.candidate, req.params.sessionId);
  if (session.status === "In progress" && Date.now() >= session.serverStartTime.getTime() + sessionLength(session)) {
    session = await finalizeSession(session.id, "time_limit");
  }
  res.json(GetCandidateSessionResponse.parse(sessionDto(session)));
});

router.post("/candidate/session/:sessionId/voice", async (req, res) => {
  const candidate: Candidate = res.locals.candidate;
  const session = await ownedSession(candidate, req.params.sessionId);
  if (session.status !== "In progress" || Date.now() >= session.serverStartTime.getTime() + sessionLength(session)) {
    throw new RoomError(409, "This audition has ended and cannot be restarted.");
  }
  if (session.conversationId || session.voiceIssuedAt) throw new RoomError(409, "The voice conversation has already started and cannot be restarted.");
  const agent = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (!agent) throw new RoomError(503, "ELEVENLABS_AGENT_ID is missing.");
  const audition = await roomDefinition(candidate);
  const data = await elevenlabsGet(`/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent)}`);
  if (typeof data.signed_url !== "string" || !data.signed_url.startsWith("wss://api.elevenlabs.io/")) {
    throw new RoomError(502, "ElevenLabs returned an invalid signed URL.");
  }
  const [leased] = await db.update(sessionsTable).set({ voiceIssuedAt: new Date() }).where(and(
    eq(sessionsTable.id, session.id), isNull(sessionsTable.voiceIssuedAt), eq(sessionsTable.status, "In progress"),
  )).returning();
  if (!leased) throw new RoomError(409, "The voice conversation has already started in another tab.");
  res.json(GetCandidateVoiceResponse.parse({
    signed_url: data.signed_url,
    dynamic_variables: {
      candidate_name: candidate.name, company: audition.company, role: audition.role,
      behavioral_questions: audition.frozen_questions.filter(q => q.phase === "Behavioral")
        .map((q, i) => `${i + 1}. ${q.prompt}`).join("\n"),
      coding_task: audition.frozen_questions.filter(q => q.phase === "Technical").map(q => q.prompt).join("\n") + "\n\n" +
        (await db.select().from(auditionsTable).where(eq(auditionsTable.id, candidate.auditionId)))[0].starterCode,
      audition_session_id: session.id,
    },
  }));
});

router.post("/candidate/session/:sessionId/conversation", async (req, res) => {
  const session = await ownedSession(res.locals.candidate, req.params.sessionId);
  const body = BindCandidateConversationBody.parse(req.body);
  if (!session.voiceIssuedAt) throw new RoomError(409, "A voice lease is required before binding a conversation.");
  if (session.conversationId && session.conversationId !== body.conversation_id) {
    throw new RoomError(409, "A different conversation is already bound to this session.");
  }
  const [updated] = await db.update(sessionsTable).set({
    conversationId: body.conversation_id,
    conversationStartOffsetMs: session.conversationStartOffsetMs ??
      Math.max(0, Math.min(SESSION_MS, Date.now() - session.serverStartTime.getTime())),
    transcriptStatus: session.status === "Submitted" || body.ended ? "pending" : session.transcriptStatus,
  }).where(and(eq(sessionsTable.id, session.id), sql`${sessionsTable.conversationId} IS NULL OR ${sessionsTable.conversationId} = ${body.conversation_id}`)).returning();
  if (!updated) throw new RoomError(409, "This session already has a conversation.");
  res.json(GetCandidateSessionResponse.parse(sessionDto(updated)));
});

router.post("/candidate/session/:sessionId/snapshots", async (req, res) => {
  const session = await ownedSession(res.locals.candidate, req.params.sessionId);
  const body = SaveCandidateSnapshotBody.parse(req.body);
  validateEvidenceTime(session, body.timestamp_ms);
  await db.insert(editorSnapshotsTable).values({
    sessionId: session.id, timestampMs: body.timestamp_ms, content: body.content,
  }).onConflictDoNothing();
  res.json({ saved: true, timestamp_ms: body.timestamp_ms });
});

router.post("/candidate/session/:sessionId/screenshots/:timestampMs",
  express.raw({ type: "image/jpeg", limit: "1mb" }), async (req, res) => {
    const session = await ownedSession(res.locals.candidate, req.params.sessionId);
    const timestamp = Number(req.params.timestampMs);
    if (!Number.isInteger(timestamp) || timestamp < session.behavioralSeconds * 1000 || timestamp > sessionLength(session) || timestamp % 10_000) {
      throw new RoomError(400, "Screenshots require a ten-second technical-phase slot.");
    }
    validateEvidenceTime(session, timestamp);
    const bytes: unknown = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new RoomError(400, "A JPEG screenshot is required.");
    }
    const path = storage.getPrivateObjectDir().replace(/^\/|\/$/g, "");
    const [bucket, ...prefix] = path.split("/");
    const objectName = `${prefix.join("/")}/sessions/${session.id}/screenshots/${timestamp}.jpg`;
    const file = objectStorageClient.bucket(bucket).file(objectName);
    try {
      await file.save(bytes, { resumable: false, metadata: { contentType: "image/jpeg" },
        preconditionOpts: { ifGenerationMatch: 0 } });
      await setObjectAclPolicy(file, { owner: session.candidateId, visibility: "private" });
    } catch (error) {
      // Idempotent duplicate capture never overwrites prior evidence.
      if ((error as { code?: number }).code !== 412) throw error;
    }
    await db.insert(screenshotsTable).values({
      sessionId: session.id, timestampMs: timestamp,
      filePath: `/objects/sessions/${session.id}/screenshots/${timestamp}.jpg`, mimeType: "image/jpeg",
    }).onConflictDoNothing();
    res.json({ saved: true, timestamp_ms: timestamp });
  });

router.post("/candidate/session/:sessionId/integrity", async (req, res) => {
  const session = await ownedSession(res.locals.candidate, req.params.sessionId);
  const body = SaveCandidateIntegrityBody.parse(req.body);
  validateEvidenceTime(session, body.timestamp_ms);
  if (body.type === "large_paste" && !body.character_count) throw new RoomError(400, "Large paste must include its character count.");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM sessions WHERE id = ${session.id} FOR UPDATE`);
    const [{ sequence }] = await tx.select({ sequence: sql<number>`coalesce(max(sequence),0)+1` })
      .from(integrityEventsTable).where(eq(integrityEventsTable.sessionId, session.id));
    await tx.insert(integrityEventsTable).values({
      sessionId: session.id, eventId: body.event_id, sequence, timestampMs: body.timestamp_ms,
      type: body.type, details: body.character_count ? { character_count: body.character_count } : {},
    }).onConflictDoNothing();
  });
  res.json({ saved: true, timestamp_ms: body.timestamp_ms });
});

router.post("/candidate/session/:sessionId/commands", async (req, res) => {
  const candidate: Candidate = res.locals.candidate;
  const session = await ownedSession(candidate, req.params.sessionId);
  const body = SaveCandidateCommandBody.parse(req.body);
  const elapsed = Math.max(0, Math.min(SESSION_MS, Date.now() - session.serverStartTime.getTime()));
  validateEvidenceTime(session, elapsed);
  if (body.kind === "technical_start" && elapsed < session.behavioralSeconds * 1000 - 1000) throw new RoomError(409, "Technical phase has not begun.");
  if (body.kind === "wrap_up" && elapsed < sessionLength(session) - Math.min(30, (session.durationSeconds - session.behavioralSeconds) / 4) * 1000 - 1000) throw new RoomError(409, "Wrap-up time has not begun.");
  const controls = {
    technical_start: "Start technical part",
    wrap_up: "Wrap up",
    time_check: "Time check: politely cut in and move on.",
    page_left: "The candidate left the audition page.",
    screen_share_stopped: "The candidate stopped sharing their screen.",
    initial_context: "",
  };
  let text = controls[body.kind];
  if (body.kind === "initial_context") {
    const audition = await roomDefinition(candidate);
    text = `This is a standardized ${audition.duration_seconds / 60}-minute ${audition.role} audition for ${audition.company}. Ask only the frozen behavioral questions in order during the first ${session.behavioralSeconds} seconds: ${audition.frozen_questions.filter(q => q.phase === "Behavioral").map(q => q.prompt).join(" / ")}. Do not invent questions. When told "Start technical part", use this frozen task: ${audition.frozen_questions.filter(q => q.phase === "Technical").map(q => q.prompt).join(" / ")}. App time and integrity controls are not candidate answers.`;
  }
  const contextual = ["initial_context", "page_left", "screen_share_stopped"].includes(body.kind);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM sessions WHERE id = ${session.id} FOR UPDATE`);
    const [{ sequence }] = await tx.select({ sequence: sql<number>`coalesce(max(sequence),0)+1` })
      .from(transcriptEntriesTable).where(eq(transcriptEntriesTable.sessionId, session.id));
    await tx.insert(transcriptEntriesTable).values({
      sessionId: session.id, sequence, timestampMs: elapsed, speaker: "candidate",
      text, isAppMessage: true, origin: "app", commandId: body.command_id, commandKind: body.kind,
    }).onConflictDoNothing();
  });
  res.json({ text, delivery: contextual ? "contextual_update" : "user_message", is_app_message: true });
});

router.post("/candidate/session/:sessionId/submit", async (req, res) => {
  const session = await ownedSession(res.locals.candidate, req.params.sessionId);
  const body = SubmitCandidateRoomBody.parse(req.body);
  let finalized = await finalizeSession(session.id, body.reason);
  if (body.editor_content !== undefined && Date.now() <= finalized.submittedAt!.getTime() + 30_000) {
    const [withCode] = await db.update(sessionsTable).set({ finalEditorContent: body.editor_content })
      .where(and(eq(sessionsTable.id, session.id), isNull(sessionsTable.finalEditorContent))).returning();
    if (withCode) finalized = withCode;
  }
  res.json(GetCandidateSessionResponse.parse(sessionDto(finalized)));
});

router.use("/candidate", (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const validation = error && typeof error === "object" && "name" in error && error.name === "ZodError";
  const status = error instanceof RoomError ? error.status : validation ? 400 : 502;
  const message = validation ? "Invalid request. Check the required fields." :
    redactProviderError(error instanceof Error ? error.message : "Request failed.");
  req.log.warn({ status, message }, "Candidate room request failed");
  res.status(status).json({ error: "candidate_room_error", message });
});

export default router;
