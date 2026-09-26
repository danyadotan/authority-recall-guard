import { performance } from "node:perf_hooks";
import { MossClient, type DocumentInfo } from "@moss-js/moss";

import { AUTHORITY_EVIDENCE, evidenceVersion, type AuthorityEvidence } from "./evidence.ts";
import type { Decision } from "./hygiene.ts";

export { AUTHORITY_EVIDENCE, type AuthorityEvidence } from "./evidence.ts";

export type RetrievedEvidence = Omit<AuthorityEvidence, "changeTypes"> & { score: number };

export type RetrievalResult = {
  query: string;
  latencyMs: number;
  indexName?: string;
  evidence: RetrievedEvidence[];
};

export type EvidenceDecision = {
  decision: Decision;
  reason: string;
  matched: string[];
};

export type MossLike = {
  listIndexes(): Promise<Array<{ name: string }>>;
  createIndex(indexName: string, docs: DocumentInfo[], options?: { modelId?: string }): Promise<unknown>;
  loadIndex(indexName: string): Promise<unknown>;
  query(
    indexName: string,
    query: string,
    options?: { topK?: number; alpha?: number }
  ): Promise<{ docs: Array<{ id: string; text: string; score: number; metadata?: Record<string, string> }> }>;
};

const DECISIONS: readonly Decision[] = ["auto_pass", "surface", "require_approval", "escalate"];

export function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && (DECISIONS as readonly string[]).includes(value);
}

export class MossAuthorityRetriever {
  readonly indexName: string;
  readonly policyVersion: string;
  private client: MossLike;
  private evidence: AuthorityEvidence[];

  constructor(client: MossLike, options: { indexPrefix?: string; evidence?: AuthorityEvidence[] } = {}) {
    this.client = client;
    this.evidence = options.evidence ?? AUTHORITY_EVIDENCE;
    this.policyVersion = evidenceVersion(this.evidence);
    this.indexName = `${options.indexPrefix ?? "authority-recall-guard"}-${this.policyVersion}`;
  }

  static fromCredentials(projectId: string, projectKey: string): MossAuthorityRetriever {
    return new MossAuthorityRetriever(new MossClient(projectId, projectKey));
  }

  async initialize(): Promise<void> {
    const documents: DocumentInfo[] = this.evidence.map(({ id, text, decision, source }) => ({
      id, text, metadata: { decision, source },
    }));
    const indexes = await this.client.listIndexes();
    if (!indexes.some((index) => index.name === this.indexName)) {
      await this.client.createIndex(this.indexName, documents, { modelId: "moss-minilm" });
    }
    await this.client.loadIndex(this.indexName);
  }

  async retrieve(query: string, topK = 3): Promise<RetrievalResult> {
    const started = performance.now();
    const result = await this.client.query(this.indexName, query, { topK, alpha: 0.65 });
    const latencyMs = performance.now() - started;
    return {
      query,
      latencyMs,
      indexName: this.indexName,
      evidence: result.docs.map((doc) => {
        const decision = doc.metadata?.decision;
        return {
          id: doc.id,
          text: doc.text,
          score: doc.score,
          decision: isDecision(decision) ? decision : "escalate",
          source: doc.metadata?.source ?? "unknown",
        };
      }),
    };
  }
}

export const DEFAULT_MINIMUM_SCORE = 0.45;

export function decideFromEvidence(result: RetrievalResult, minimumScore = DEFAULT_MINIMUM_SCORE): EvidenceDecision {
  const strong = result.evidence.filter((item) => item.score >= minimumScore);
  const matched = strong.map((item) => item.id);
  if (strong.length === 0) return { decision: "escalate", reason: "No authority evidence cleared the confidence threshold.", matched };
  const precedence = ["require_approval", "escalate", "surface", "auto_pass"] as const;
  for (const decision of precedence) {
    const hit = strong.find((item) => item.decision === decision);
    if (hit) return { decision, reason: `Retrieved ${hit.id} from ${hit.source} (${hit.score.toFixed(3)}).`, matched };
  }
  return { decision: "escalate", reason: "Retrieved evidence had no recognized decision.", matched };
}
