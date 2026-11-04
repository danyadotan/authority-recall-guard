import test from "node:test";
import assert from "node:assert/strict";
import { createContractExecutor, type Contract } from "../src/contract-executor.ts";

const contract = { to: "client@example.test", subject: "Contract update", body: "We promise a four-hour response time." };
function setup() {
  let clock = 1_000;
  const sent: Contract[] = [];
  const boundary = createContractExecutor({ policyVersion: "contract-send-v1", now: () => clock,
    transport: async (c, digest) => { sent.push(c); return { id: `receipt-${sent.length}`, digest }; } });
  const approve = (input: unknown = contract, ttl = 60_000) => boundary.reviewer.approve(boundary.reviewer.review(input).digest, ttl);
  return { ...boundary, sent, approve, tick: (ms: number) => { clock += ms; } };
}

test("agent has send capability only; unapproved disguised contract never reaches transport", async () => {
  const s = setup();
  assert.deepEqual(Object.keys(s.agent), ["send"]);
  for (const changeType of [undefined, "formatting_only", "approved_personalization", "auto_pass"]) {
    await assert.rejects(s.agent.send({ ...contract, changeType }));
  }
  assert.equal(s.sent.length, 0);
});

test("complete loop: blocked, exact review, approval, send, matching receipt, replay blocked", async () => {
  const s = setup();
  await assert.rejects(s.agent.send(contract));
  const review = s.reviewer.review(contract);
  assert.deepEqual(review.contract, contract);
  const token = s.reviewer.approve(review.digest);
  const receipt = await s.agent.send(contract, token);
  assert.equal(receipt.digest, review.digest);
  assert.deepEqual(s.sent, [contract]);
  await assert.rejects(s.agent.send(contract, token));
  assert.deepEqual(s.reviewer.audit().map(x => x.event), ["blocked", "reviewed", "approved", "dispatch_started", "confirmed", "blocked"]);
});

for (const field of ["to", "subject", "body"] as const) {
  test(`changed ${field} invalidates exact-action approval`, async () => {
    const s = setup(); const token = s.approve();
    const value = field === "to" ? "attacker@example.test" : "Changed material";
    await assert.rejects(s.agent.send({ ...contract, [field]: value }, token));
    assert.equal(s.sent.length, 0);
  });
}

test("forged and unknown tokens cannot authorize", async () => {
  const s = setup();
  for (const token of ["true", "approved", "0".repeat(64)]) await assert.rejects(s.agent.send(contract, token));
  assert.equal(s.sent.length, 0);
  assert.throws(() => s.reviewer.approve("not-reviewed"));
});

test("expired approval is blocked at exact expiry", async () => {
  const s = setup(); const token = s.approve(contract, 10); s.tick(10);
  await assert.rejects(s.agent.send(contract, token)); assert.equal(s.sent.length, 0);
});

test("revocation and policy changes invalidate grants", async () => {
  const s = setup(); const revoked = s.approve(); s.reviewer.revoke(revoked);
  await assert.rejects(s.agent.send(contract, revoked));
  const stale = s.approve(); s.reviewer.setPolicyVersion("v2");
  await assert.rejects(s.agent.send(contract, stale)); assert.equal(s.sent.length, 0);
});

test("one token authorizes at most one concurrent dispatch", async () => {
  const s = setup(); const token = s.approve();
  const results = await Promise.allSettled(Array.from({length: 20}, () => s.agent.send(contract, token)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(s.sent.length, 1);
});

test("malformed payloads never reach transport", async () => {
  const s = setup(); const token = s.approve();
  for (const input of [null, {}, {...contract, to:"bad"}, {...contract, subject:"Header\r\nBcc: x"}, {...contract, body:""}, {...contract, tool:"bypass"}]) {
    await assert.rejects(s.agent.send(input, token));
  }
  assert.equal(s.sent.length, 0);
});

test("input mutation after dispatch cannot substitute body", async () => {
  const s = setup(); const input = {...contract}; const token = s.approve(input);
  const pending = s.agent.send(input, token); input.body = "Substituted";
  await pending; assert.equal(s.sent[0].body, contract.body); assert.ok(Object.isFrozen(s.sent[0]));
});

test("transport failure consumes token and records unknown delivery; no automatic retry", async () => {
  let calls = 0;
  const s = createContractExecutor({policyVersion:"v1", transport:async () => {calls++; throw new Error("timeout after possible send");}});
  const token = s.reviewer.approve(s.reviewer.review(contract).digest);
  await assert.rejects(s.agent.send(contract, token));
  await assert.rejects(s.agent.send(contract, token));
  assert.equal(calls,1); assert.ok(s.reviewer.audit().some(e => e.event === "delivery_unknown"));
});

test("receipt mismatch is never confirmed and token stays spent", async () => {
  const s = createContractExecutor({policyVersion:"v1", transport:async () => ({id:"fake", digest:"wrong"})});
  const token = s.reviewer.approve(s.reviewer.review(contract).digest);
  await assert.rejects(s.agent.send(contract, token)); await assert.rejects(s.agent.send(contract, token));
  assert.ok(!s.reviewer.audit().some(e => e.event === "confirmed"));
});

test("process restart loses approvals and fails closed", async () => {
  const old = setup(); const token = old.approve(); const restarted = setup();
  await assert.rejects(restarted.agent.send(contract, token)); assert.equal(restarted.sent.length,0);
});
