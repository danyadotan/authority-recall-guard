import fs from "node:fs";
import { AUTHORITY_EVIDENCE } from "./evidence.js";
import { DEFAULT_MINIMUM_SCORE, type RetrievalResult } from "./retrieval.js";
import { evaluate, hasSafetyFailures, summarize, validateCases, type EvalCase } from "./eval-metrics.js";
import { evalRetriever } from "./eval-moss.js";

async function main() {
  const cases: EvalCase[] = JSON.parse(fs.readFileSync("examples/eval/queries.json", "utf8"));
  validateCases(cases);
  const runs = [];
  // Query again for each alpha; reuse identical ranked results across thresholds and gate modes.
  for (const alpha of [0, .65, .8, 1]) {
    const { retriever, timings, close } = evalRetriever(alpha, process.env.MOSS_EVAL_CACHE_PATH);
    try {
      await retriever.initialize();
      const retrieved: Array<{ c: EvalCase; result: RetrievalResult }> = [];
      for (const c of cases) retrieved.push({ c, result: await retriever.retrieve(c.action) });
      const thresholds = [.3, .35, .4, .45, .5, .55, .6, .7].map((threshold) => {
        const rows = retrieved.map(({ c, result }) => evaluate(c, result, threshold));
        return {
          threshold, summary: summarize(rows),
          byDeclaredChangeType: {
            present: summarize(rows.filter((r) => r.changeType !== undefined)),
            absent: summarize(rows.filter((r) => r.changeType === undefined)),
          },
          byWording: {
            original: summarize(rows.filter((r) => r.kind === "original")),
            paraphrase: summarize(rows.filter((r) => r.kind === "paraphrase")),
          },
          rows,
        };
      });
      runs.push({ alpha, indexName: retriever.indexName, policyVersion: retriever.policyVersion, initialization: timings, thresholds });
    } finally { await close(); }
  }
  const baseline = runs.find((r) => r.alpha === .65)!.thresholds.find((r) => r.threshold === DEFAULT_MINIMUM_SCORE)!;
  const report = {
    mode: "live-moss", sdkVersion: JSON.parse(fs.readFileSync("node_modules/@moss-js/moss/package.json", "utf8")).version,
    nodeVersion: process.version, environment: "local-process", createdAt: new Date().toISOString(),
    modelId: "moss-minilm", topK: 3, corpusSize: AUTHORITY_EVIDENCE.length, queryCount: cases.length,
    note: "Synthetic small-corpus evaluation; latency here is diagnostic, not a warm-query benchmark. Sweeps are exploratory, not held-out validation.",
    baselineSafetyPassed: !hasSafetyFailures(baseline.summary), runs,
  };
  const json = JSON.stringify(report, null, 2);
  const output = process.argv[2];
  if (output) fs.writeFileSync(output, json + "\n");
  else console.log(json);
  if (hasSafetyFailures(baseline.summary)) process.exitCode = 1;
}
main().catch(() => {
  // SDK/network errors may contain credentials. Do not echo their payloads.
  console.error("Live Moss evaluation failed. Check credentials, connectivity and SDK setup; no successful report was produced.");
  process.exitCode = 1;
});
