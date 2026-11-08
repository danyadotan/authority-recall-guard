# Retrieval evaluation and local performance

This harness follows Kent Robertson's November 6, 2026 recommendations. It uses the existing eight synthetic policy documents; it does not change the gate, executor, approval tokens or production retrieval settings.

## Run

Install with `npm ci`. `@moss-js/moss` is pinned to **1.22.0** in both manifests (previously the lockfile resolved 1.12.0). Set `MOSS_PROJECT_ID` and `MOSS_PROJECT_KEY` in the environment, without putting keys in commands, reports or commits.

```sh
npm run check
npm run eval -- /tmp/authority-eval.json
npm run benchmark:moss -- /tmp/authority-benchmark.json
```

Both live commands fail without credentials; neither substitutes simulated results. Top-level SDK errors are suppressed because their payloads can contain credentials. Unit tests use synthetic retrieval and fake query timings and make no live Moss calls. Output files are written only after successful completion of the measurements; remove old reports before a new run if reusing filenames.

Both commands create the content-versioned policy index if absent, and reuse it otherwise. Existing indexes are not deleted or rewritten. `createIndexMs: null` means creation was skipped, not that creation took zero time. To time creation, use a project where this policy index is absent. Creation may incur provider usage. Benchmark caches are temporary and removed on completion.

## Quality report

The 24 original actions and their changeType declarations are preserved. Every case now has a stable ID, `expectedPolicyIds` and `expectedWithoutChangeType`; 13 paraphrases add indirect wording and a case requiring two approval policies. Labels are curated expectations, not inferred from the retrieved results or gate outcome. For formatting without a declared changeType the expected gate decision is `escalate`, as required by the existing gate. The unrelated pizza request has no relevant document (`expectedPolicyIds: []`).

The report keeps these separate:

- **Raw retrieval:** macro recall@1 and recall@3, independent of score threshold and the gate. Recall is the fraction of all expected policy IDs present in the first k returned results. Queries with no relevant policy have null recall and are excluded from its mean; counts are included.
- **Precision@3:** relevant unique IDs in the first three returned positions divided by 3. Empty or short results retain that denominator. A repeated ID cannot increase credit; an ID below rank three cannot count. The empty-label request scores zero precision for any results.
- **Missed approval documents:** case ID and each expected approval-policy ID absent from top three, including partial misses when two are expected. An unrelated approval document does not count as a hit.
- **Threshold missed approvals:** expected approval documents absent or below the threshold in top three. A raw retrieval hit can therefore still fail this check.
- **Gate:** accuracy, approval recall, missed approval cases and unsafe auto-pass counts, with the declared changeType and with it removed. These are paired comparisons on exactly the same retrieval results. `withChangeType` means “as declared”; cases with no declaration are unchanged in both modes.

Each run also reports separate cohorts for present/absent changeType and original/paraphrased wording. Alpha is swept at 0, .65 (production baseline), .8 and 1. Results are queried anew for each alpha; eight score thresholds are applied offline to the same ranked results. No minScore is sent to Moss, so raw retrieval is not hidden by threshold filtering. Production still uses alpha .65 and threshold .45.

The CLI exits nonzero if the production baseline has any raw or threshold approval-document miss, gate approval miss or unsafe auto-pass in either gate mode. Diagnostic sweep failures remain visible but do not select a new production setting. This is exploratory tuning on a small synthetic dataset, not held-out or production validation. Policy chunking into a larger realistic corpus remains future work; changing corpus identity here would conflate a measurement change with a retrieval change.

## Performance report

The benchmark uses three sequential child processes:

1. **Setup:** create the versioned index if absent (separate createIndex timer, including embedding), then load using its own cache. Loading is separately timed; index listing and client construction are outside these timers.
2. **Empty-cache load:** a new process loads the index using a different, initially absent cache directory. Index creation is disallowed. Time the first query separately, then discard 3 full rounds over all queries. Measure 50 full rounds and report raw millisecond samples and nearest-rank p50/p95/p99.
3. **Reused-cache load:** another new process loads using the cache from step 2, with the same first-query/warm-up/50-round protocol.

The first query after each load is excluded from warm percentiles (at alpha > 0 it can include opening the embedding model). The load timer includes only the awaited loadIndex call. Each report records process IDs, index name, policy hash, SDK/Node versions, corpus size, topK and alpha. Loads are single observations, not percentile estimates. A requested reused cache does not prove an SDK cache hit. Operating-system and global embedding-model caches are uncontrolled, so “empty-cache” refers specifically to the index cache. Local measurements include SDK overhead in the query timer and must be reported separately from Vercel/serverless measurements. No serverless measurements are performed here.

## Verification for this change

Local type checking, synthetic tests and the deterministic demo are run during development. Live retrieval quality and latency require credentials and a working native Moss runtime. Passing synthetic tests establishes metric and control-flow behavior; it does not establish any recall, precision or latency result for Moss.
