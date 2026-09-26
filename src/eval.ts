import fs from "node:fs";
import path from "node:path";

import { POLICY, combineDecisions } from "./gate.ts";
import { classify, type Decision } from "./hygiene.ts";
import { DEFAULT_MINIMUM_SCORE, MossAuthorityRetriever, decideFromEvidence, type RetrievalResult } from "./retrieval.ts";

type Case = { action: string; expected: Decision; changeType?: string };

const projectId = process.env.MOSS_PROJECT_ID;
const projectKey = process.env.MOSS_PROJECT_KEY;
if (!projectId || !projectKey) throw new Error("Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY.");

const cases: Case[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "examples", "eval", "queries.json"), "utf8")
);

const retriever = MossAuthorityRetriever.fromCredentials(projectId, projectKey);
await retriever.initialize();

const retrieved: Array<{ testCase: Case; result: RetrievalResult }> = [];
for (const testCase of cases) {
  retrieved.push({ testCase, result: await retriever.retrieve(testCase.action) });
}

function run(threshold: number) {
  return retrieved.map(({ testCase, result }) => {
    const policy = testCase.changeType
      ? classify({ id: "eval", changeType: testCase.changeType, change: testCase.action }, POLICY)
      : undefined;
    const { decision } = combineDecisions(decideFromEvidence(result, threshold), policy);
    return { ...testCase, decision, topScore: result.evidence[0]?.score ?? 0, latencyMs: result.latencyMs };
  });
}

function summarize(rows: ReturnType<typeof run>) {
  const approvals = rows.filter((row) => row.expected === "require_approval");
  return {
    accuracy: rows.filter((row) => row.decision === row.expected).length / rows.length,
    approvalRecall: approvals.filter((row) => row.decision === "require_approval").length / approvals.length,
    unsafeAutoPass: rows.filter((row) => row.decision === "auto_pass" && row.expected !== "auto_pass").length,
  };
}

const rows = run(DEFAULT_MINIMUM_SCORE);
console.table(rows.map(({ action, expected, decision, topScore, latencyMs }) => ({
  action: action.slice(0, 60), expected, decision, ok: expected === decision, topScore: topScore.toFixed(3), latencyMs: latencyMs.toFixed(2),
})));

console.log(`\nThreshold ${DEFAULT_MINIMUM_SCORE}:`, summarize(rows));
console.log("\nThreshold sweep:");
console.table([0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7].map((threshold) => ({ threshold, ...summarize(run(threshold)) })));

const current = summarize(rows);
if (current.approvalRecall < 1 || current.unsafeAutoPass > 0) {
  console.error("\nFAIL: approval recall must be 100% and no unsafe auto_pass is allowed.");
  process.exitCode = 1;
}
