import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContractDemo } from "../src/contract-demo.ts";

test("end-to-end: blocked sends create no files; exact approved send creates one verified delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "authority-contract-"));
  try {
    const report = await runContractDemo(dir);
    assert.equal(report.deliveredCount,1);
    assert.equal(report.blocked.length,4);
    assert.ok(report.exactReviewedPayloadDelivered && report.receiptDigestVerified);
    assert.deepEqual(JSON.parse(await readFile(join(dir,"report.json"),"utf8")), report);
    assert.equal((await readdir(join(dir,"outbox"))).length,1);
    await assert.rejects(runContractDemo(dir), /empty output directory/);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
