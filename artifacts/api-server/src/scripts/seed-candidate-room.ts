import { randomBytes, createHash } from "node:crypto";
import { eq, inArray, isNull, and, or } from "drizzle-orm";
import { db, pool, auditionsTable, auditionQuestionsTable, candidatesTable, sessionsTable } from "@workspace/db";
import { AUDITION_SECONDS, AUDITION_TIMING, DEMO_STARTER } from "../../../../shared/audition-config";

const test = process.argv.includes("--test");
const legacyTitle = "Build reliable services and solve practical engineering problems at Google.";
const title = "Ship reliable software and solve practical engineering problems at Northstar Labs.";
const questions = [
  { position: 1, requirement: "Delivery decisions under constraints", phase: "Behavioral" as const,
    timeLimitSeconds: AUDITION_TIMING.behavioralSeconds,
    prompt: "Tell me about a time you had to ship something under a tight deadline. What did you cut, and how did you decide?", referenceNote: null },
  { position: 2, requirement: "Return the k most frequent values, most frequent first.", phase: "Technical" as const,
    timeLimitSeconds: AUDITION_TIMING.technicalSeconds,
    prompt: "This function should return the k most frequent numbers, but it has a bug. Fix it, then explain the time complexity and how you would make it faster.",
    referenceNote: "bug = ascending sort; fix = reverse=True or heapq.nlargest(k, counts, key=counts.get); complexity O(n + m log m), m = distinct values; faster with a heap: O(n + m log k)." },
];
try {
  const [old] = await db.select().from(auditionsTable).where(or(eq(auditionsTable.jobDescription, title), eq(auditionsTable.jobDescription, legacyTitle))).limit(1);
  const audition = await db.transaction(async tx => {
    const snapshot = { questions, starterCode: DEMO_STARTER, language: "Python" };
    if (old) {
      const previous = await tx.select().from(auditionQuestionsTable).where(eq(auditionQuestionsTable.auditionId, old.id));
      const candidateIds = (await tx.select({ id: candidatesTable.id }).from(candidatesTable).where(eq(candidatesTable.auditionId, old.id))).map(c => c.id);
      if (candidateIds.length) await tx.update(sessionsTable).set({
        questionSnapshot: old.frozenSnapshot ?? { questions: previous, starterCode: old.starterCode, language: old.editorLanguage },
      }).where(and(inArray(sessionsTable.candidateId, candidateIds), isNull(sessionsTable.questionSnapshot)));
      await tx.delete(auditionQuestionsTable).where(eq(auditionQuestionsTable.auditionId, old.id));
    }
    const fields = { company: "Northstar Labs", role: "Senior Software Engineer", editorLanguage: "Python", jobDescription: title,
      durationSeconds: AUDITION_SECONDS, starterCode: DEMO_STARTER, frozenSnapshot: snapshot,
      snapshotHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
    const [record] = old
      ? await tx.update(auditionsTable).set(fields).where(eq(auditionsTable.id, old.id)).returning()
      : await tx.insert(auditionsTable).values({ ...fields, inviteToken: randomBytes(32).toString("hex") }).returning();
    await tx.insert(auditionQuestionsTable).values(questions.map(q => ({ ...q, auditionId: record.id })));
    return record;
  });
  if (!process.argv.includes("--update-only")) {
    const email = test ? `room-test-${randomBytes(6).toString("hex")}@example.test` : "candidate-demo@example.test";
    const [prior] = await db.select().from(candidatesTable).where(eq(candidatesTable.email, email)).limit(1);
    const candidate = prior ?? (await db.insert(candidatesTable).values({
      auditionId: audition.id, name: test ? "Room Verification" : "Your name", email,
      inviteToken: randomBytes(32).toString("hex"),
    }).returning())[0];
    console.log(JSON.stringify({ invite_path: `/invite/${candidate.inviteToken}`, candidate_id: candidate.id, test }));
  } else console.log("Demo audition updated in place. No invite was opened or session created.");
} finally { await pool.end(); }
