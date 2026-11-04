import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createContractExecutor } from "./contract-executor.js";

// Synthetic local delivery sink. No real email or customer information is used.
export async function runContractDemo(directory: string) {
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length) throw new Error("Use a new empty output directory");
  const outbox = resolve(directory, "outbox");
  await mkdir(outbox);
  const boundary = createContractExecutor({ policyVersion: "contract-send-v1",
    transport: async (contract, digest) => {
      const id = randomUUID();
      const destination = resolve(outbox, `${id}.json`);
      const bytes = JSON.stringify({ contract, digest }, null, 2) + "\n";
      const handle = await open(destination, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      assert.equal(await readFile(destination, "utf8"), bytes);
      return { id, digest };
    },
  });
  const original = { to: "client@example.test", subject: "Contract update", body: "We promise a four-hour response time.", changeType: "formatting_only" };
  const blocked: string[] = [];
  await assert.rejects(boundary.agent.send(original)); blocked.push("unapproved_disguised_contract");
  assert.equal((await readdir(outbox)).length, 0);
  const review = boundary.reviewer.review(original);
  // Simulated trusted reviewer approval; real human authentication is out of scope.
  const token = boundary.reviewer.approve(review.digest);
  await assert.rejects(boundary.agent.send({ ...original, body: original.body + " And an unlimited refund." }, token)); blocked.push("body_substitution");
  await assert.rejects(boundary.agent.send({ ...original, to: "other@example.test" }, token)); blocked.push("recipient_substitution");
  assert.equal((await readdir(outbox)).length, 0);
  const receipt = await boundary.agent.send(original, token);
  await assert.rejects(boundary.agent.send(original, token)); blocked.push("approval_replay");
  const files = await readdir(outbox);
  assert.equal(files.length, 1);
  const delivered = JSON.parse(await readFile(resolve(outbox, files[0]), "utf8"));
  assert.deepEqual(delivered.contract, review.contract);
  assert.equal(delivered.digest, review.digest);
  assert.equal(receipt.digest, review.digest);
  const recomputed = createHash("sha256").update(JSON.stringify({ policyVersion: review.policyVersion, ...delivered.contract })).digest("hex");
  assert.equal(recomputed, receipt.digest);
  const report = { scenario: "synthetic contract send to local file outbox", blocked, deliveredCount: files.length,
    exactReviewedPayloadDelivered: true, receiptDigestVerified: true, digest: receipt.digest,
    approval: "simulated trusted reviewer; no human identity verification", transport: "local file; no external email", audit: boundary.reviewer.audit() };
  await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Provide a new empty output directory");
  console.log(JSON.stringify(await runContractDemo(resolve(process.argv[2])), null, 2));
}
