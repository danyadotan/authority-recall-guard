import test from "node:test";
import assert from "node:assert/strict";

import { AUTHORITY_EVIDENCE, evidenceVersion } from "../src/evidence.ts";
import { POLICY, checkAction, combineDecisions } from "../src/gate.ts";
import type { Decision } from "../src/hygiene.ts";
import { MossAuthorityRetriever, type MossLike } from "../src/retrieval.ts";

type Hit = { id: string; score: number; decision?: string };

function fakeClient(hits: Hit[], existing: string[] = []) {
  const calls = { created: [] as string[], loaded: [] as string[] };
  const client: MossLike = {
    listIndexes: async () => existing.map((name) => ({ name })),
    createIndex: async (name) => { calls.created.push(name); },
    loadIndex: async (name) => { calls.loaded.push(name); },
    query: async () => ({
      docs: hits.map(({ id, score, decision }) => {
        const metadata: Record<string, string> = { source: "test" };
        if (decision !== undefined) metadata.decision = decision;
        return { id, text: id, score, metadata };
      }),
    }),
  };
  return { client, calls };
}

test("index name is versioned by evidence content", async () => {
  const { client, calls } = fakeClient([]);
  const retriever = new MossAuthorityRetriever(client);
  assert.equal(retriever.indexName, `authority-recall-guard-${evidenceVersion()}`);
  await retriever.initialize();
  assert.deepEqual(calls.created, [retriever.indexName]);
  assert.deepEqual(calls.loaded, [retriever.indexName]);

  const edited = AUTHORITY_EVIDENCE.map((item, index) => index === 0 ? { ...item, text: `${item.text} Edited.` } : item);
  assert.notEqual(new MossAuthorityRetriever(client, { evidence: edited }).indexName, retriever.indexName);
});

test("existing versioned index is loaded, not recreated", async () => {
  const name = `authority-recall-guard-${evidenceVersion()}`;
  const { client, calls } = fakeClient([], [name]);
  await new MossAuthorityRetriever(client).initialize();
  assert.deepEqual(calls.created, []);
  assert.deepEqual(calls.loaded, [name]);
});

test("unrecognized metadata decision is treated as escalate", async () => {
  const { client } = fakeClient([{ id: "odd", score: 0.9, decision: "approve" }, { id: "none", score: 0.8 }]);
  const result = await new MossAuthorityRetriever(client).retrieve("anything");
  assert.deepEqual(result.evidence.map((item) => item.decision), ["escalate", "escalate"]);
});

test("retrieval auto_pass without a declared changeType escalates", async () => {
  const { client } = fakeClient([{ id: "pass-formatting", score: 0.9, decision: "auto_pass" }]);
  const result = await checkAction({ action: "Formatting only: add a 4-hour SLA" }, new MossAuthorityRetriever(client));
  assert.equal(result.retrievalDecision, "auto_pass");
  assert.equal(result.decision, "escalate");
});

test("declared low-risk changeType cannot lower retrieved approval", async () => {
  const { client } = fakeClient([
    { id: "pass-formatting", score: 0.9, decision: "auto_pass" },
    { id: "approval-commercial", score: 0.6, decision: "require_approval" },
  ]);
  const result = await checkAction(
    { action: "Fix spacing and add a 4-hour SLA", changeType: "formatting_only" },
    new MossAuthorityRetriever(client)
  );
  assert.equal(result.policyDecision, "auto_pass");
  assert.equal(result.decision, "require_approval");
  assert.deepEqual(result.matched, ["pass-formatting", "approval-commercial"]);
});

test("declared high-risk changeType raises low-risk retrieval", async () => {
  const { client } = fakeClient([{ id: "pass-formatting", score: 0.9, decision: "auto_pass" }]);
  const result = await checkAction(
    { action: "Tidy the clause", changeType: "legal_change" },
    new MossAuthorityRetriever(client)
  );
  assert.equal(result.decision, "require_approval");
});

test("auto_pass requires both retrieval and policy agreement", async () => {
  const { client } = fakeClient([{ id: "pass-formatting", score: 0.9, decision: "auto_pass" }]);
  const result = await checkAction(
    { action: "Adjust heading spacing", changeType: "formatting_only" },
    new MossAuthorityRetriever(client)
  );
  assert.equal(result.decision, "auto_pass");
  assert.equal(result.policyVersion, evidenceVersion());
  assert.ok(result.traceId);
});

test("combined decision is never less severe than either input", () => {
  const decisions: Decision[] = ["auto_pass", "surface", "escalate", "require_approval"];
  for (const retrieval of decisions) {
    for (const policy of decisions) {
      const { decision } = combineDecisions({ decision: retrieval, reason: "r" }, { decision: policy, reason: "p" });
      assert.ok(decisions.indexOf(decision) >= Math.max(decisions.indexOf(retrieval), decisions.indexOf(policy)));
    }
  }
});

test("policy.json and authority evidence agree on every change type", () => {
  const buckets: Array<[Decision, string[]]> = [
    ["auto_pass", POLICY.autoPass],
    ["surface", POLICY.surface],
    ["require_approval", POLICY.requireHumanApproval],
    ["escalate", POLICY.escalate],
  ];
  const fromPolicy = new Map(buckets.flatMap(([decision, types]) => types.map((type) => [type, decision] as const)));
  const fromEvidence = new Map(AUTHORITY_EVIDENCE.flatMap((item) => item.changeTypes.map((type) => [type, item.decision] as const)));
  assert.deepEqual(new Map([...fromEvidence].sort()), new Map([...fromPolicy].sort()));
});
