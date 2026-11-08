import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUTHORITY_EVIDENCE } from "./evidence.js";
import { latencySummary, validateCases, type EvalCase } from "./eval-metrics.js";
import { credentials, evalRetriever } from "./eval-moss.js";

export async function measureQueries(
  query: (text: string) => Promise<{ latencyMs: number }>, queries: string[], warmupRounds = 3, rounds = 50,
) {
  if (!queries.length || !Number.isInteger(warmupRounds) || warmupRounds < 0 || !Number.isInteger(rounds) || rounds < 1) {
    throw new Error("Invalid benchmark configuration.");
  }
  const firstQueryMs = (await query(queries[0])).latencyMs;
  for (let round = 0; round < warmupRounds; round++) for (const text of queries) await query(text);
  const samplesMs = [];
  for (let round = 0; round < rounds; round++) for (const text of queries) samplesMs.push((await query(text)).latencyMs);
  return { firstQueryMs, warmupRounds, rounds, warm: latencySummary(samplesMs), samplesMs };
}

async function worker(phase: string, cachePath: string) {
  const { retriever, timings, close } = evalRetriever(.65, cachePath, phase === "setup");
  try {
    await retriever.initialize();
    const cases: EvalCase[] = JSON.parse(fs.readFileSync("examples/eval/queries.json", "utf8"));
    validateCases(cases);
    const queries = phase === "setup" ? null : await measureQueries((q) => retriever.retrieve(q), cases.map((c) => c.action));
    process.send?.({ phase, pid: process.pid, indexName: retriever.indexName, policyVersion: retriever.policyVersion, ...timings, queries });
  } finally { await close(); }
  process.disconnect?.();
}

async function main(output?: string) {
  credentials(); // Fail before spawning workers or creating temporary directories.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "authority-moss-bench-"));
  function run(phase: string, cache: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ["--worker", phase, cache], {
        execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      let result: Record<string, unknown> | undefined;
      const timer = setTimeout(() => { child.kill(); reject(new Error("Benchmark worker timed out.")); }, 300_000);
      child.on("message", (message) => { result = message as Record<string, unknown>; });
      child.on("error", () => { clearTimeout(timer); reject(new Error("Could not start benchmark worker.")); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0 && result) resolve(result);
        else reject(new Error("Benchmark worker failed."));
      });
    });
  }
  try {
    // Setup gets a different cache so it cannot pre-warm the measured cold-load cache.
    const setup = await run("setup", path.join(temp, "setup-cache"));
    const cache = path.join(temp, "measured-cache");
    const cold = await run("empty-cache-new-process", cache);
    const reload = await run("reused-cache-new-process", cache);
    const report = {
      mode: "live-moss", environment: "local-process", nodeVersion: process.version,
      sdkVersion: JSON.parse(fs.readFileSync("node_modules/@moss-js/moss/package.json", "utf8")).version,
      modelId: "moss-minilm", queryCount: JSON.parse(fs.readFileSync("examples/eval/queries.json", "utf8")).length,
      createdAt: new Date().toISOString(), corpusSize: AUTHORITY_EVIDENCE.length, alpha: .65, topK: 3,
      note: "createIndexMs is null when the versioned index already exists. Loads are single observations; warm-query percentiles exclude the first query and 3 complete warm-up rounds. Reused cache is requested, not proof of a cache hit. OS/model caches are uncontrolled. Serverless performance is not measured.",
      setup, cold, reload,
    };
    const json = JSON.stringify(report, null, 2);
    if (output) fs.writeFileSync(output, json + "\n");
    else console.log(json);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv[2] === "--worker" ? worker(process.argv[3], process.argv[4]) : main(process.argv[2]);
  task.catch(() => {
    console.error("Live Moss benchmark failed. Check credentials, connectivity and SDK setup; no successful report was produced.");
    process.exitCode = 1;
    if (process.connected) process.disconnect?.();
  });
}
