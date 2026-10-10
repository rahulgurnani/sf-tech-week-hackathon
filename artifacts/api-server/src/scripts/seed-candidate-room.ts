import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, auditionsTable, auditionQuestionsTable, candidatesTable } from "@workspace/db";

const test = process.argv.includes("--test");
const title = "Build reliable services and solve practical engineering problems at Google.";
const [existing] = await db.select().from(auditionsTable).where(eq(auditionsTable.jobDescription, title)).limit(1);
const audition = existing ?? await db.transaction(async tx => {
  const [created] = await tx.insert(auditionsTable).values({
    company: "Google", role: "Software Engineer", jobDescription: title,
    editorLanguage: "TypeScript", inviteToken: randomBytes(32).toString("hex"),
  }).returning();
  await tx.insert(auditionQuestionsTable).values([
    { auditionId: created.id, position: 1, requirement: "Ownership and problem solving", phase: "Behavioral",
      timeLimitSeconds: 90, prompt: "Tell me about a time you took ownership of a difficult production issue. What did you do, and what changed as a result?" },
    { auditionId: created.id, position: 2, requirement: "Collaboration and communication", phase: "Behavioral",
      timeLimitSeconds: 90, prompt: "Describe a technical disagreement with a teammate. How did you work through it, and what was the outcome?" },
    { auditionId: created.id, position: 3, requirement: "Algorithms and code clarity", phase: "Technical",
      timeLimitSeconds: 180, prompt: "Implement firstUniqueChar(text: string): string | null. Return the first character that appears exactly once, or null if none does. Treat characters as case-sensitive. Aim for O(n) time. Examples: 'swiss' → 'w'; 'aabb' → null. Explain your approach and edge cases as you code." },
  ]);
  return created;
});
const email = test ? `room-test-${randomBytes(6).toString("hex")}@example.test` : "candidate-demo@example.test";
const [prior] = await db.select().from(candidatesTable).where(eq(candidatesTable.email, email)).limit(1);
const candidate = prior ?? (await db.insert(candidatesTable).values({
  auditionId: audition.id, name: test ? "Room Verification" : "Your name",
  email, inviteToken: randomBytes(32).toString("hex"),
}).returning())[0];
console.log(JSON.stringify({ invite_path: `/invite/${candidate.inviteToken}`, candidate_id: candidate.id, test }));
await pool.end();
