import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluate, hasSafetyFailures, latencySummary, scoreRetrieval, summarize, validateCases, type EvalCase } from "../src/eval-metrics.ts";
import { AUTHORITY_EVIDENCE } from "../src/evidence.ts";
import type { RetrievalResult } from "../src/retrieval.ts";
import { measureQueries } from "../src/benchmark-moss.ts";

const c: EvalCase = {
  id: "approval", action: "Tell them the bill will be lower", expected: "require_approval",
  expectedWithoutChangeType: "require_approval", changeType: "commercial_commitment",
  expectedPolicyIds: ["approval-commercial"], kind: "paraphrase",
};
function result(...entries: Array<[string, number]>): RetrievalResult {
  return { query: c.action, latencyMs: 1, evidence: entries.map(([id, score]) => ({ ...AUTHORITY_EVIDENCE.find((p) => p.id === id)!, score })) };
}

test("a correct deterministic gate cannot hide a missing approval document", () => {
  const row = evaluate(c, result(["pass-formatting", .9]), .45);
  assert.equal(row.withChangeType, "require_approval");
  assert.equal(row.withoutChangeType, "escalate");
  assert.deepEqual(row.retrieval.missedApprovalIds, ["approval-commercial"]);
  const summary = summarize([row]);
  assert.equal(summary.gate.withChangeType.accuracy, 1);
  assert.equal(summary.retrieval.recallAt3, 0);
  assert.equal(hasSafetyFailures(summary), true);
});

test("multi-policy recall and precision respect rank, fixed k and missing documents", () => {
  const multi = { ...c, expectedPolicyIds: ["approval-commercial", "approval-permission"] };
  const scored = scoreRetrieval(multi, result(["approval-permission", .9], ["pass-formatting", .8], ["approval-commercial", .7]), .45);
  assert.equal(scored.recallAt1, .5);
  assert.equal(scored.recallAt3, 1);
  assert.equal(scored.precisionAt3, 2 / 3);
  assert.deepEqual(scored.missedApprovalIds, []);
  const partial = scoreRetrieval(multi, result(["approval-commercial", .9]), .45);
  assert.equal(partial.recallAt3, .5);
  assert.equal(partial.precisionAt3, 1 / 3);
  assert.deepEqual(partial.missedApprovalIds, ["approval-permission"]);
});

test("irrelevant approval is still a retrieval miss even if the retrieval decision is correct", () => {
  const row = evaluate(c, result(["approval-financial", .9]), .45);
  assert.equal(row.retrievalDecision, "require_approval");
  assert.equal(row.retrieval.recallAt3, 0);
  assert.equal(hasSafetyFailures(summarize([row])), true);
});

test("threshold misses remain separate from raw top-k misses", () => {
  const weak = evaluate(c, result(["approval-commercial", .44]), .45);
  assert.deepEqual(weak.retrieval.missedApprovalIds, []);
  assert.deepEqual(weak.retrieval.thresholdMissedApprovalIds, ["approval-commercial"]);
  assert.equal(weak.retrieval.recallAt3, 1);
  assert.equal(hasSafetyFailures(summarize([weak])), true);
  assert.equal(hasSafetyFailures(summarize([evaluate(c, result(["approval-commercial", .45]), .45)])), false);
});

test("duplicate IDs and documents below rank three cannot inflate recall", () => {
  const scored = scoreRetrieval(c, result(["pass-formatting", .9], ["pass-formatting", .8], ["approval-financial", .7], ["approval-commercial", .6]), .45);
  assert.equal(scored.recallAt3, 0);
  assert.deepEqual(scored.missedApprovalIds, ["approval-commercial"]);
});

test("empty results, no relevant policy and empty groups do not produce NaN or false recall", () => {
  assert.equal(scoreRetrieval(c, result(), .45).recallAt3, 0);
  const noPolicy = { ...c, expected: "escalate" as const, expectedPolicyIds: [] };
  const scored = scoreRetrieval(noPolicy, result(["pass-formatting", .8]), .45);
  assert.equal(scored.recallAt3, null);
  assert.equal(scored.precisionAt3, 0);
  const empty = summarize([]);
  assert.equal(empty.gate.withChangeType.approvalRecall, null);
  assert.equal(empty.retrieval.recallAt3, null);
});

test("removing changeType uses its own expected decision for safe formatting", () => {
  const safe: EvalCase = { ...c, expected: "auto_pass", expectedWithoutChangeType: "escalate", changeType: "formatting_only", expectedPolicyIds: ["pass-formatting"] };
  const summary = summarize([evaluate(safe, result(["pass-formatting", .9]), .45)]);
  assert.equal(summary.gate.withChangeType.accuracy, 1);
  assert.equal(summary.gate.withoutChangeType.accuracy, 1);
});

test("the committed dataset has unique IDs, valid policy labels and paraphrases", () => {
  const cases: EvalCase[] = JSON.parse(fs.readFileSync("examples/eval/queries.json", "utf8"));
  validateCases(cases);
  assert.equal(cases.length, 37);
  assert.equal(cases.filter((c) => c.kind === "paraphrase").length, 13);
  assert.throws(() => validateCases([]));
  assert.throws(() => validateCases([c, c]));
  assert.throws(() => validateCases([{ ...c, expectedPolicyIds: ["invented"] }]));
  assert.throws(() => validateCases([{ ...c, expectedPolicyIds: [] }]));
});

test("nearest-rank percentiles include sample count and handle empty input", () => {
  assert.deepEqual(latencySummary([9, 1, 3, 2, 4]), { count: 5, p50: 3, p95: 9, p99: 9 });
  assert.deepEqual(latencySummary([]), { count: 0, p50: null, p95: null, p99: null });
  assert.throws(() => latencySummary([NaN]));
});

test("simulated benchmark excludes first query and three full warm-up rounds", async () => {
  const calls: string[] = [];
  const measured = await measureQueries(async (text) => {
    calls.push(text);
    return { latencyMs: calls.length };
  }, ["one", "two"], 3, 50);
  assert.equal(measured.firstQueryMs, 1);
  assert.equal(calls.length, 107);
  assert.deepEqual(calls.slice(1, 7), ["one", "two", "one", "two", "one", "two"]);
  assert.equal(measured.samplesMs[0], 8);
  assert.equal(measured.warm.count, 100);
  assert.equal(measured.warm.p50, 57);
  await assert.rejects(() => measureQueries(async () => ({ latencyMs: 0 }), []));
  await assert.rejects(() => measureQueries(async () => ({ latencyMs: 0 }), ["x"], 3, 0));
});

test("evaluation adapter isolates create/load timings and forwards cache and alpha", async () => {
  const { createEvalRetriever } = await import("../src/eval-moss.ts");
  const calls: unknown[] = [];
  const client = {
    async listIndexes() { return []; },
    async createIndex(...args: unknown[]) { calls.push(["create", ...args]); },
    async loadIndex(...args: unknown[]) { calls.push(["load", ...args]); },
    async query(...args: unknown[]) { calls.push(["query", ...args]); return { docs: [] }; },
    async close() { calls.push(["close"]); },
  };
  const run = createEvalRetriever(client, 0, "/tmp/fake-eval-cache");
  await run.retriever.initialize();
  await run.retriever.retrieve("a paraphrase");
  await run.close();
  assert.equal(run.timings.createIndexMs !== null, true);
  assert.equal(run.timings.loadIndexMs !== null, true);
  assert.deepEqual(calls[1], ["load", run.retriever.indexName, { cachePath: "/tmp/fake-eval-cache" }]);
  assert.deepEqual(calls[2], ["query", run.retriever.indexName, "a paraphrase", { topK: 3, alpha: 0 }]);
  assert.deepEqual(calls[3], ["close"]);
  const reused = createEvalRetriever({ ...client, async listIndexes() { return [{ name: run.retriever.indexName }]; } }, .65);
  await reused.retriever.initialize();
  assert.equal(reused.timings.createIndexMs, null);
  await assert.rejects(() => createEvalRetriever(client, .65, undefined, false).retriever.initialize());
});
