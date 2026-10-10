import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyScores, sampleScreens } from "./scoring";
test("Unverifiable quotes require human review; quoted timestamps come from real evidence", () => {
  const scores = verifyScores([
    { requirement: "Technical", level: 3, rationale: "Fixed ordering", quotes: [{ source: "code", quote: "reverse=True" }] },
    { requirement: "Behavioral", level: 4, rationale: "Invented", quotes: [{ source: "transcript", quote: "I owned everything", timestamp_ms: 1 }] },
    { requirement: "Collaboration", level: "not_covered", rationale: "No evidence", quotes: [] },
  ], [{ text: "We cut the optional feature.", timestampMs: 42000 }], "sorted(counts, key=counts.get, reverse=True)[:k]");
  assert.equal(scores[0].needs_review, false);
  assert.equal(scores[1].needs_review, true);
  assert.equal(scores[2].level, "not_covered");
  const [real] = verifyScores([{ requirement: "Delivery", level: 3, rationale: "Prioritized", quotes: [
    { source: "transcript", quote: "cut the optional feature", timestamp_ms: 999999 },
  ] }], [{ text: "We cut the optional feature.", timestampMs: 42000 }], "");
  assert.equal(real.quotes[0].timestamp_ms, 42000);
});
test("Screen sampling uses at most six frames and includes first and last", () => {
  assert.deepEqual(sampleScreens([1, 2]), [1, 2]);
  const frames = sampleScreens(Array.from({ length: 50 }, (_, i) => i));
  assert.equal(frames.length, 6); assert.equal(frames[0], 0); assert.equal(frames[5], 49);
});
