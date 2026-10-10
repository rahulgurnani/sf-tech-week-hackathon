import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { eq } from "drizzle-orm";
import {
  db, pool, auditionsTable, candidatesTable, sessionsTable, editorSnapshotsTable,
  transcriptEntriesTable, integrityEventsTable, evaluationsTable, type Session,
} from "@workspace/db";
import { AUDITION_MS } from "../../../../shared/audition-config";
import app from "../app";
import { validateEvidenceTime } from "./candidate-session";
import { createNebiusClient } from "./nebius-client";

test("Evidence uses server time, effective end and bounded receipt grace", () => {
  const start = Date.now();
  const session = { serverStartTime: new Date(start), submittedAt: null, durationSeconds: AUDITION_MS / 1000 } as Session;
  assert.doesNotThrow(() => validateEvidenceTime(session, 10_000, start + 10_000));
  assert.throws(() => validateEvidenceTime(session, 20_000, start + 10_000));
  assert.throws(() => validateEvidenceTime(session, 0, start + 30_001));
  session.submittedAt = new Date(start + 10_000);
  assert.doesNotThrow(() => validateEvidenceTime(session, 10_000, start + 20_000));
  assert.throws(() => validateEvidenceTime(session, 15_000, start + 20_000));
  assert.throws(() => validateEvidenceTime(session, 360_000, start + 391_000));
});

test("Shared Nebius defaults disable thinking and scoring rejects reasoning-only output", async () => {
  let payload: Record<string, unknown> | undefined;
  const client = createNebiusClient("test-key", async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"level":3}' } }] }));
  });
  assert.deepEqual(await client.complete(" model-id ", [{ role: "user", content: "Score" }], true), { level: 3 });
  assert.equal(payload?.model, "model-id");
  assert.equal(payload?.max_tokens, 1024);
  assert.deepEqual(payload?.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(payload?.response_format, { type: "json_object" });
  const reasoningOnly = createNebiusClient("test-key", async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "not an answer" } }] })));
  await assert.rejects(reasoningOnly.complete("model", [{ role: "user", content: "Score" }]), /no answer content/);
});

test("Candidate API is scoped, atomic, irreversible and persists final editor/app provenance", async () => {
  const token = randomBytes(32).toString("hex");
  const otherToken = randomBytes(32).toString("hex");
  const nonce = randomUUID();
  const [audition] = await db.insert(auditionsTable).values({
    role: "API verification", company: "Test", jobDescription: "Isolated automated verification",
    editorLanguage: "TypeScript", inviteToken: randomBytes(32).toString("hex"),
  }).returning();
  const [candidate, other] = await db.insert(candidatesTable).values([
    { auditionId: audition.id, name: "API test", email: `api-${nonce}@example.test`, inviteToken: token },
    { auditionId: audition.id, name: "Other", email: `other-${nonce}@example.test`, inviteToken: otherToken },
  ]).returning();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const request = async (path: string, body?: unknown, bearer = token) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/candidate${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() as Record<string, any> };
  };
  let sessionId: string | undefined;
  let otherSessionId: string | undefined;
  try {
    assert.equal((await request("/room", undefined, "invalid")).status, 401);
    const identity = { candidate_name: "API test", candidate_email: candidate.email };
    assert.equal((await request("/start", { ...identity, screen_surface: "window" })).status, 400);
    const starts = await Promise.all([request("/start", { ...identity, screen_surface: "monitor" }),
      request("/start", { ...identity, screen_surface: "monitor" })]);
    assert.equal(starts[0].status, 200); assert.equal(starts[1].status, 200);
    assert.equal(starts[0].data.id, starts[1].data.id);
    assert.equal(starts[0].data.server_start_time, starts[1].data.server_start_time);
    assert.equal(Date.parse(starts[0].data.deadline_at) - Date.parse(starts[0].data.server_start_time), AUDITION_MS);
    sessionId = starts[0].data.id;
    assert.equal((await request(`/session/${sessionId}`, undefined, otherToken)).status, 404);
    assert.equal((await request(`/session/${sessionId}/submit`, { reason: "time_limit" })).status, 409);
    assert.equal((await request(`/session/${sessionId}/snapshots`, { timestamp_ms: 5, content: "invalid slot" })).status, 400);
    assert.equal((await request(`/session/${sessionId}/snapshots`, { timestamp_ms: 300_000, content: "future" })).status, 409);
    for (let i = 0; i < 2; i++) assert.equal((await request(`/session/${sessionId}/snapshots`,
      { timestamp_ms: 0, content: "const draft = 1;" })).status, 200);
    const event = { event_id: randomUUID(), timestamp_ms: 0, type: "large_paste", character_count: 70 };
    for (let i = 0; i < 2; i++) assert.equal((await request(`/session/${sessionId}/integrity`, event)).status, 200);
    const command = await request(`/session/${sessionId}/commands`, { command_id: randomUUID(), kind: "initial_context" });
    assert.equal(command.data.is_app_message, true);
    const [appEntry] = await db.select().from(transcriptEntriesTable).where(eq(transcriptEntriesTable.sessionId, sessionId!));
    assert.equal(appEntry.isAppMessage, true); assert.equal(appEntry.origin, "app");
    const submitted = await request(`/session/${sessionId}/submit`, { reason: "finished_early", editor_content: "const final = 2;" });
    assert.equal(submitted.status, 200); assert.equal(submitted.data.status, "Submitted");
    const retry = await request(`/session/${sessionId}/submit`, { reason: "time_limit", editor_content: "tampered retry" });
    assert.equal(retry.data.submitted_at, submitted.data.submitted_at);
    const restart = await request("/start", { ...identity, screen_surface: "monitor" });
    assert.equal(restart.data.id, sessionId); assert.equal(restart.data.status, "Submitted");
    assert.equal((await request(`/session/${sessionId}/voice`, {})).status, 409);
    const room = await request("/room");
    assert.equal(room.data.editor_content, "const final = 2;");
    assert.equal(room.data.candidate.status, "Submitted");
    assert.equal((await db.select().from(editorSnapshotsTable).where(eq(editorSnapshotsTable.sessionId, sessionId!))).length, 1);
    assert.equal((await db.select().from(integrityEventsTable).where(eq(integrityEventsTable.sessionId, sessionId!))).length, 1);
    const otherStart = await request("/start", { candidate_name: other.name, candidate_email: other.email, screen_surface: "monitor" }, otherToken);
    assert.equal(otherStart.status, 200); otherSessionId = otherStart.data.id;
    const goodbye = await request(`/session/${otherSessionId}/submit`, { reason: "conversation_ended", editor_content: "def done(): pass" }, otherToken);
    assert.equal(goodbye.status, 200); assert.equal(goodbye.data.finish_reason, "conversation_ended");
    assert.ok(Date.parse(goodbye.data.submitted_at) < Date.parse(otherStart.data.deadline_at));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (sessionId) {
      await db.delete(editorSnapshotsTable).where(eq(editorSnapshotsTable.sessionId, sessionId));
      await db.delete(integrityEventsTable).where(eq(integrityEventsTable.sessionId, sessionId));
      await db.delete(evaluationsTable).where(eq(evaluationsTable.sessionId, sessionId));
      await db.delete(transcriptEntriesTable).where(eq(transcriptEntriesTable.sessionId, sessionId));
      await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
    }
    if (otherSessionId) {
      await db.delete(evaluationsTable).where(eq(evaluationsTable.sessionId, otherSessionId));
      await db.delete(sessionsTable).where(eq(sessionsTable.id, otherSessionId));
    }
    await db.delete(candidatesTable).where(eq(candidatesTable.auditionId, audition.id));
    await db.delete(auditionsTable).where(eq(auditionsTable.id, audition.id));
  }
});
after(() => pool.end());
