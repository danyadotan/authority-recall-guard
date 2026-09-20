import { performance } from "node:perf_hooks";
import { MossClient, type DocumentInfo } from "@moss-js/moss";

export type AuthorityEvidence = {
  id: string;
  text: string;
  decision: "auto_pass" | "surface" | "require_approval" | "escalate";
  source: string;
};

export type RetrievalResult = {
  query: string;
  latencyMs: number;
  evidence: Array<AuthorityEvidence & { score: number }>;
};

export const AUTHORITY_EVIDENCE: AuthorityEvidence[] = [
  { id: "approval-commercial", text: "Commercial commitments, pricing changes, service-level promises, and contractual terms require explicit human approval.", decision: "require_approval", source: "authority-policy" },
  { id: "approval-financial", text: "Payments, purchases, credits, refunds, and financial commitments require explicit human approval.", decision: "require_approval", source: "authority-policy" },
  { id: "approval-permission", text: "Changing access, recipients, permissions, or disclosure scope requires explicit human approval.", decision: "require_approval", source: "authority-policy" },
  { id: "escalate-missing", text: "Missing evidence, conflicting policy, unresolved identity, or unclear authority must escalate rather than be guessed.", decision: "escalate", source: "authority-policy" },
  { id: "surface-material", text: "Material style changes and unusual but reversible changes should be surfaced for human attention.", decision: "surface", source: "attention-policy" },
  { id: "pass-formatting", text: "Formatting-only changes that preserve meaning and audience can pass without human rereading when already verified.", decision: "auto_pass", source: "attention-policy" },
  { id: "pass-approved-personalization", text: "Approved personalization within an existing audience and explicit policy can pass while remaining traceable.", decision: "auto_pass", source: "attention-policy" },
];

export class MossAuthorityRetriever {
  private client: MossClient;
  private indexName: string;

  constructor(projectId: string, projectKey: string, indexName = "authority-recall-guard") {
    this.client = new MossClient(projectId, projectKey);
    this.indexName = indexName;
  }

  async initialize(): Promise<void> {
    const documents: DocumentInfo[] = AUTHORITY_EVIDENCE.map(({ id, text, decision, source }) => ({
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
      evidence: result.docs.map((doc) => ({
        id: doc.id,
        text: doc.text,
        score: doc.score,
        decision: (doc.metadata?.decision as AuthorityEvidence["decision"]) ?? "escalate",
        source: (doc.metadata?.source as string) ?? "unknown",
      })),
    };
  }
}

export function decideFromEvidence(result: RetrievalResult, minimumScore = 0.45) {
  const strong = result.evidence.filter((item) => item.score >= minimumScore);
  if (strong.length === 0) return { decision: "escalate" as const, reason: "No authority evidence cleared the confidence threshold." };
  const precedence = ["require_approval", "escalate", "surface", "auto_pass"] as const;
  for (const decision of precedence) {
    const hit = strong.find((item) => item.decision === decision);
    if (hit) return { decision, reason: `Retrieved ${hit.id} from ${hit.source} (${hit.score.toFixed(3)}).` };
  }
  return { decision: "escalate" as const, reason: "Retrieved evidence had no recognized decision." };
}
