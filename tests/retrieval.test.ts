import test from "node:test";
import assert from "node:assert/strict";
import { decideFromEvidence } from "../src/retrieval.ts";

test("approval evidence wins over lower-risk evidence", () => {
  const result = decideFromEvidence({ query: "send price promise", latencyMs: 3, evidence: [
    { id: "pass", text: "formatting", score: .9, decision: "auto_pass", source: "test" },
    { id: "approval", text: "commercial commitment", score: .8, decision: "require_approval", source: "test" },
  ]});
  assert.equal(result.decision, "require_approval");
});

test("weak or absent evidence fails closed", () => {
  const result = decideFromEvidence({ query: "unknown", latencyMs: 2, evidence: [
    { id: "weak", text: "maybe", score: .2, decision: "auto_pass", source: "test" },
  ]});
  assert.equal(result.decision, "escalate");
});
