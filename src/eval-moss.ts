// Evaluation-only adapter: production retrieval settings and enforcement stay unchanged.
import { performance } from "node:perf_hooks";
import { MossClient } from "@moss-js/moss";
import { MossAuthorityRetriever, type MossLike } from "./retrieval.js";

export function credentials() {
  const id = process.env.MOSS_PROJECT_ID;
  const key = process.env.MOSS_PROJECT_KEY;
  if (!id || !key) throw new Error("Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY.");
  return { id, key };
}

type EvalClient = Omit<MossLike, "loadIndex"> & {
  loadIndex(name: string, options?: { cachePath: string }): Promise<unknown>;
  close(): Promise<void>;
};

export function evalRetriever(alpha: number, cachePath?: string, allowCreate = true) {
  const { id, key } = credentials();
  return createEvalRetriever(new MossClient(id, key), alpha, cachePath, allowCreate);
}

export function createEvalRetriever(client: EvalClient, alpha: number, cachePath?: string, allowCreate = true) {
  const timings = { createIndexMs: null as number | null, loadIndexMs: null as number | null };
  const adapter: MossLike = {
    listIndexes: () => client.listIndexes(),
    async createIndex(name, docs, options) {
      if (!allowCreate) throw new Error("Index missing; initialize it before benchmarking loads.");
      const start = performance.now();
      const result = await client.createIndex(name, docs, options);
      timings.createIndexMs = performance.now() - start;
      return result;
    },
    async loadIndex(name) {
      const start = performance.now();
      const result = await client.loadIndex(name, cachePath ? { cachePath } : undefined);
      timings.loadIndexMs = performance.now() - start;
      return result;
    },
    query: (name, query, options) => client.query(name, query, { ...options, alpha }),
  };
  return { retriever: new MossAuthorityRetriever(adapter), timings, close: () => client.close() };
}
