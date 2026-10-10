import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, auditionsTable, candidatesTable, sessionsTable, evaluationsTable, transcriptEntriesTable,
  integrityEventsTable, screenshotsTable } from "@workspace/db";
import { enqueueScoring } from "../lib/scoring";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
router.use("/review", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) { res.status(401).json({ message: "A company link is required." }); return; }
  const [audition] = await db.select().from(auditionsTable).where(eq(auditionsTable.inviteToken, token));
  if (!audition) { res.status(401).json({ message: "Invalid company link." }); return; }
  res.locals.audition = audition;
  next();
});
router.get("/review/:candidateId", async (req, res) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.candidateId)) { res.status(400).json({ message: "Invalid candidate ID." }); return; }
  const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, req.params.candidateId),
    eq(candidatesTable.auditionId, res.locals.audition.id)));
  if (!candidate) { res.status(404).json({ message: "Candidate not found." }); return; }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.candidateId, candidate.id));
  if (!session || session.status !== "Submitted") { res.status(409).json({ message: "This audition has not been submitted." }); return; }
  await enqueueScoring(session.id);
  const [evaluation] = await db.select().from(evaluationsTable).where(eq(evaluationsTable.sessionId, session.id));
  const report = (evaluation.report ?? {}) as Record<string, unknown>;
  res.json({ status: evaluation.status, error: evaluation.error, candidate: {
    id: candidate.id, audition_id: candidate.auditionId, name: candidate.name, email: candidate.email,
    status: candidate.status, created_at: candidate.createdAt,
  }, company: res.locals.audition.company, role: res.locals.audition.role,
    duration_seconds: Math.round(((session.submittedAt?.getTime() ?? Date.now()) - session.serverStartTime.getTime()) / 1000),
    overall_score: evaluation.overallScore, recommendation: report.recommendation ?? null,
    reasoning: report.reasoning ?? "", scores: report.scores ?? [], timeline: report.timeline ?? [],
    vision_error: report.vision_error ?? null, transcript_missing: report.transcript_missing ?? true,
    final_code: session.finalEditorContent ?? "",
    transcript: (await db.select().from(transcriptEntriesTable).where(eq(transcriptEntriesTable.sessionId, session.id))
      .orderBy(asc(transcriptEntriesTable.sequence))).map(t => ({ id: t.id, session_id: t.sessionId, sequence: t.sequence,
        speaker: t.speaker, text: t.text, timestamp_ms: t.timestampMs, origin: t.origin, is_app_message: t.isAppMessage })),
    integrity_flags: (await db.select().from(integrityEventsTable).where(eq(integrityEventsTable.sessionId, session.id))
      .orderBy(asc(integrityEventsTable.timestampMs))).map(f => ({
        id: f.id, timestamp_ms: f.timestampMs, type: f.type, details: f.details,
      })),
  });
});
router.post("/review/:candidateId/retry", async (req, res) => {
  const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, req.params.candidateId),
    eq(candidatesTable.auditionId, res.locals.audition.id)));
  if (!candidate) { res.status(404).json({ message: "Candidate not found." }); return; }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.candidateId, candidate.id));
  if (!session || session.status !== "Submitted") { res.status(409).json({ message: "Session not submitted." }); return; }
  await db.update(evaluationsTable).set({ status: "pending", error: null }).where(and(
    eq(evaluationsTable.sessionId, session.id), eq(evaluationsTable.status, "error")));
  res.json({ queued: true });
});
router.get("/review/:candidateId/screenshots/:screenshotId", async (req, res) => {
  const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, req.params.candidateId),
    eq(candidatesTable.auditionId, res.locals.audition.id)));
  if (!candidate) { res.status(404).end(); return; }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.candidateId, candidate.id));
  if (!session) { res.status(404).end(); return; }
  const [image] = await db.select().from(screenshotsTable).where(and(eq(screenshotsTable.id, req.params.screenshotId),
    eq(screenshotsTable.sessionId, session.id)));
  if (!image) { res.status(404).end(); return; }
  const file = await storage.getObjectEntityFile(image.filePath);
  res.type("image/jpeg");
  file.createReadStream().on("error", () => { if (!res.headersSent) res.status(502).end(); else res.end(); }).pipe(res);
});
export default router;
