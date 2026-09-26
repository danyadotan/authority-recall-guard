import { randomUUID } from "node:crypto";

import policyConfig from "../config/policy.json" with { type: "json" };
import { classify, type Decision, type Policy } from "./hygiene.ts";
import { decideFromEvidence, type MossAuthorityRetriever, type RetrievedEvidence } from "./retrieval.ts";

export type ActionCheck = {
  action: string;
  changeType?: string;
};

export type GateResult = {
  traceId: string;
  timestamp: string;
  policyVersion: string;
  indexName?: string;
  query: string;
  changeType?: string;
  decision: Decision;
  reason: string;
  retrievalDecision: Decision;
  policyDecision?: Decision;
  matched: string[];
  latencyMs: number;
  evidence: RetrievedEvidence[];
};

const SEVERITY: Record<Decision, number> = {
  auto_pass: 0,
  surface: 1,
  escalate: 2,
  require_approval: 3,
};

export const POLICY: Policy = policyConfig;

export function combineDecisions(
  retrieval: { decision: Decision; reason: string },
  policy: { decision: Decision; reason: string } | undefined
): { decision: Decision; reason: string } {
  if (!policy) {
    if (retrieval.decision === "auto_pass") {
      return {
        decision: "escalate",
        reason: `${retrieval.reason} Auto-pass requires a declared changeType that policy also auto-passes.`,
      };
    }
    return retrieval;
  }
  return SEVERITY[policy.decision] > SEVERITY[retrieval.decision] ? policy : retrieval;
}

export async function checkAction(
  input: ActionCheck,
  retriever: MossAuthorityRetriever,
  policy: Policy = POLICY,
  minimumScore?: number
): Promise<GateResult> {
  const result = await retriever.retrieve(input.action);
  const retrieval = decideFromEvidence(result, minimumScore);
  const policyResult = input.changeType
    ? classify({ id: "action", changeType: input.changeType, change: input.action }, policy)
    : undefined;
  const final = combineDecisions(retrieval, policyResult);
  return {
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    policyVersion: retriever.policyVersion,
    indexName: result.indexName,
    query: input.action,
    changeType: input.changeType,
    decision: final.decision,
    reason: final.reason,
    retrievalDecision: retrieval.decision,
    policyDecision: policyResult?.decision,
    matched: retrieval.matched,
    latencyMs: result.latencyMs,
    evidence: result.evidence,
  };
}
