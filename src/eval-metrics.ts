import { AUTHORITY_EVIDENCE } from "./evidence.js";
import { POLICY, combineDecisions } from "./gate.js";
import { classify, type Decision } from "./hygiene.js";
import { decideFromEvidence, isDecision, type RetrievalResult } from "./retrieval.js";

export type EvalCase = {
  id: string;
  action: string;
  expected: Decision;
  expectedWithoutChangeType: Decision;
  expectedPolicyIds: string[];
  changeType?: string;
  kind: "original" | "paraphrase";
};

export function validateCases(cases: EvalCase[]): void {
  if (!cases.length) throw new Error("Evaluation set must not be empty.");
  const ids = new Set<string>();
  const policies = new Set(AUTHORITY_EVIDENCE.map((p) => p.id));
  for (const c of cases) {
    if (!c.id || ids.has(c.id)) throw new Error(`Missing or duplicate case ID: ${c.id}`);
    ids.add(c.id);
    if (!Array.isArray(c.expectedPolicyIds) || new Set(c.expectedPolicyIds).size !== c.expectedPolicyIds.length ||
        c.expectedPolicyIds.some((id) => !policies.has(id))) throw new Error(`Invalid policy labels: ${c.id}`);
    if (!c.action || !isDecision(c.expected) || !isDecision(c.expectedWithoutChangeType) ||
        !["original", "paraphrase"].includes(c.kind) ||
        (c.changeType !== undefined && typeof c.changeType !== "string")) throw new Error(`Incomplete case: ${c.id}`);
    if (c.expected === "require_approval" && !c.expectedPolicyIds.some((id) =>
      AUTHORITY_EVIDENCE.some((p) => p.id === id && p.decision === "require_approval"))) {
      throw new Error(`Approval case lacks approval-policy label: ${c.id}`);
    }
  }
}

// Nearest-rank percentiles. Empty samples are null, never a zero-ms claim.
export function latencySummary(samples: number[]) {
  if (samples.some((x) => !Number.isFinite(x) || x < 0)) throw new Error("Invalid latency sample.");
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
  return { count: sorted.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) };
}

export function scoreRetrieval(c: EvalCase, result: RetrievalResult, threshold: number) {
  // Preserve returned rank. Deduplicate document IDs so repeats cannot inflate recall.
  const top = [...new Set(result.evidence.slice(0, 3).map((p) => p.id))];
  const expected = new Set(c.expectedPolicyIds);
  const hits = (ids: string[]) => ids.filter((id) => expected.has(id)).length;
  const approvalIds = c.expectedPolicyIds.filter((id) =>
    AUTHORITY_EVIDENCE.some((p) => p.id === id && p.decision === "require_approval"));
  const strong = new Set(result.evidence.slice(0, 3).filter((p) => p.score >= threshold).map((p) => p.id));
  return {
    retrievedIds: top,
    recallAt1: expected.size ? hits(top.slice(0, 1)) / expected.size : null,
    recallAt3: expected.size ? hits(top) / expected.size : null,
    precisionAt3: hits(top) / 3,
    missedApprovalIds: approvalIds.filter((id) => !top.includes(id)),
    thresholdMissedApprovalIds: approvalIds.filter((id) => !strong.has(id)),
  };
}

export function evaluate(c: EvalCase, result: RetrievalResult, threshold: number) {
  const retrieval = decideFromEvidence(result, threshold);
  const policy = c.changeType ? classify({ id: c.id, changeType: c.changeType, change: c.action }, POLICY) : undefined;
  const withChangeType = combineDecisions(retrieval, policy).decision;
  const withoutChangeType = combineDecisions(retrieval, undefined).decision;
  return {
    id: c.id, kind: c.kind, action: c.action, changeType: c.changeType,
    expected: c.expected, expectedWithoutChangeType: c.expectedWithoutChangeType,
    expectedPolicyIds: c.expectedPolicyIds,
    retrieved: result.evidence.slice(0, 3).map(({ id, score, decision }) => ({ id, score, decision })),
    retrieval: scoreRetrieval(c, result, threshold),
    retrievalDecision: retrieval.decision, withChangeType, withoutChangeType,
    latencyMs: result.latencyMs,
  };
}

export function summarize(rows: ReturnType<typeof evaluate>[]) {
  const mean = (xs: Array<number | null>) => {
    const values = xs.filter((x): x is number => x !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  function gate(mode: "withChangeType" | "withoutChangeType") {
    const expected = (r: typeof rows[number]) => mode === "withChangeType" ? r.expected : r.expectedWithoutChangeType;
    const approvals = rows.filter((r) => expected(r) === "require_approval");
    return {
      accuracy: mean(rows.map((r) => Number(r[mode] === expected(r)))),
      approvalRecall: mean(approvals.map((r) => Number(r[mode] === "require_approval"))),
      missedApprovals: approvals.filter((r) => r[mode] !== "require_approval").map((r) => r.id),
      unsafeAutoPass: rows.filter((r) => r[mode] === "auto_pass" && expected(r) !== "auto_pass").length,
    };
  }
  return {
    count: rows.length,
    retrieval: {
      labelledRelevantQueries: rows.filter((r) => r.retrieval.recallAt3 !== null).length,
      recallAt1: mean(rows.map((r) => r.retrieval.recallAt1)),
      recallAt3: mean(rows.map((r) => r.retrieval.recallAt3)),
      precisionAt3: mean(rows.map((r) => r.retrieval.precisionAt3)),
      missedApprovals: rows.filter((r) => r.retrieval.missedApprovalIds.length).map((r) => ({ id: r.id, policyIds: r.retrieval.missedApprovalIds })),
      thresholdMissedApprovals: rows.filter((r) => r.retrieval.thresholdMissedApprovalIds.length).map((r) => ({ id: r.id, policyIds: r.retrieval.thresholdMissedApprovalIds })),
    },
    gate: { withChangeType: gate("withChangeType"), withoutChangeType: gate("withoutChangeType") },
  };
}

export function hasSafetyFailures(summary: ReturnType<typeof summarize>): boolean {
  return summary.retrieval.missedApprovals.length > 0 || summary.retrieval.thresholdMissedApprovals.length > 0 ||
    Object.values(summary.gate).some((g) => g.missedApprovals.length > 0 || g.unsafeAutoPass > 0);
}
