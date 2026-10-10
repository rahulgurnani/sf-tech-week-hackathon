import { test, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool, auditionsTable, auditionQuestionsTable, candidatesTable, sessionsTable, evaluationsTable } from "@workspace/db";
import app from "../app";
after(() => pool.end());
test("Company lifecycle: live draft, editable approval, immutable hash, invites and human callback", async () => {
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = async (path: string, body?: unknown, authorization?: string) => {
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  };
  let auditionId: string | undefined, candidateId: string | undefined;
  try {
    const created = await request("/company", { company: "Company verification", contact_email: "verification@example.test",
      role: "Python Software Engineer", job_description: "Build Python data-processing services, debug algorithmic bugs, collaborate on reliable releases." });
    assert.equal(created.status, 201);
    const token = created.data.company_token, prefix = `/company/${token}`;
    assert.equal((await request("/company/not-a-token")).status, 401);
    const initial = await request(prefix); auditionId = initial.data.id;
    assert.equal(initial.data.approval_status, "draft");
    assert.equal((await request(prefix + "/candidates", { name: "Isolated candidate", email: "isolated@example.test" })).status, 409);
    const generated = await request(prefix + "/draft", {});
    assert.equal(generated.status, 200, JSON.stringify(generated.data));
    const draft = generated.data;
    assert.equal(draft.language, "Python"); assert.ok(draft.behavioral.prompt.length > 10); assert.ok(draft.technical.follow_up.length > 10);
    draft.behavioral.prompt += " Please explain your trade-off.";
    assert.equal((await request(prefix + "/draft", { draft })).status, 200);
    const approvals = await Promise.all([request(prefix + "/approve", { draft }), request(prefix + "/approve", { draft })]);
    assert.equal(approvals[0].status, 200); assert.equal(approvals[0].data.snapshot_hash, approvals[1].data.snapshot_hash);
    assert.match(approvals[0].data.snapshot_hash, /^[a-f0-9]{64}$/);
    assert.equal((await request(prefix + "/draft", { draft })).status, 409);
    const invite = await request(prefix + "/candidates", { name: "Isolated candidate", email: `isolated-${randomBytes(4).toString("hex")}@example.test` });
    assert.equal(invite.status, 201); candidateId = invite.data.id;
    const candidateToken = invite.data.invite_path.split("/").pop();
    const room = await request("/candidate/room", undefined, candidateToken);
    assert.equal(room.status, 200); assert.equal(room.data.audition.frozen_questions.length, 2);
    assert.equal(room.data.audition.duration_seconds, 120); assert.equal(room.data.editor_content, draft.starter_code);
    assert.equal(JSON.stringify(room.data).includes('"reference_note"'), false);
    assert.equal(JSON.stringify(room.data).includes('"referenceNote"'), false);
    assert.equal((await request(`/review/${candidateId}`, undefined, candidateToken)).status, 401);
    assert.equal((await request(prefix + `/candidates/${candidateId}/callback`, {})).status, 409);
    const [submitted] = await db.insert(sessionsTable).values({ candidateId: candidateId!, durationSeconds: 120, behavioralSeconds: 60,
      status: "Submitted", serverStartTime: new Date(Date.now() - 10000), submittedAt: new Date(), finishReason: "conversation_ended" }).returning();
    assert.equal((await request(prefix + `/candidates/${candidateId}/callback`, {})).status, 409);
    await db.insert(evaluationsTable).values({ sessionId: submitted.id, status: "ready", overallScore: 3,
      spokenSummaryText: "Dashboard readiness test fixture.", report: { recommendation: "Hold" } });
    const callback = await request(prefix + `/candidates/${candidateId}/callback`, {});
    assert.equal(callback.status, 200); assert.equal(callback.data.marked, true); assert.match(callback.data.mailto, /^mailto:/);
    const final = await request(prefix);
    assert.equal(final.data.candidates[0].callback_at !== null, true);
    assert.equal(final.data.candidates[0].recommendation, "Hold");
    assert.equal(final.data.candidates[0].integrity_flags_count, 0);
    await db.update(candidatesTable).set({ archivedAt: new Date() }).where(eq(candidatesTable.id, candidateId!));
    assert.equal((await request(prefix)).data.candidates.length, 0);
    assert.equal((await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId!))).length, 1);
    assert.equal(final.data.snapshot_hash, approvals[0].data.snapshot_hash);
    assert.equal((await db.select().from(auditionQuestionsTable).where(eq(auditionQuestionsTable.auditionId, auditionId!))).length, 2);
  } finally {
    if (candidateId) {
      const sessions = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.candidateId, candidateId));
      if (sessions.length) await db.delete(evaluationsTable).where(inArray(evaluationsTable.sessionId, sessions.map(s => s.id)));
      await db.delete(sessionsTable).where(eq(sessionsTable.candidateId, candidateId));
      await db.delete(candidatesTable).where(eq(candidatesTable.id, candidateId));
    }
    if (auditionId) {
      await db.delete(auditionQuestionsTable).where(eq(auditionQuestionsTable.auditionId, auditionId));
      await db.delete(auditionsTable).where(eq(auditionsTable.id, auditionId));
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
