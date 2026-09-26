import { createHash } from "node:crypto";

import type { Decision } from "./hygiene.ts";

export type AuthorityEvidence = {
  id: string;
  text: string;
  decision: Decision;
  source: string;
  changeTypes: string[];
};

export const AUTHORITY_EVIDENCE: AuthorityEvidence[] = [
  { id: "approval-commercial", text: "Commercial commitments, pricing changes, service-level promises, and contractual terms require explicit human approval.", decision: "require_approval", source: "authority-policy", changeTypes: ["commercial_commitment"] },
  { id: "approval-financial", text: "Payments, purchases, credits, refunds, and financial commitments require explicit human approval.", decision: "require_approval", source: "authority-policy", changeTypes: ["financial_commitment"] },
  { id: "approval-permission", text: "Changing access, recipients, permissions, or disclosure scope requires explicit human approval.", decision: "require_approval", source: "authority-policy", changeTypes: ["permission_change"] },
  { id: "approval-legal", text: "Legal changes, including liability, indemnity, warranty, termination, governing law, and compliance language, require explicit human approval.", decision: "require_approval", source: "authority-policy", changeTypes: ["legal_change"] },
  { id: "escalate-missing", text: "Missing evidence, conflicting policy, unresolved identity, unresolved risk, or unclear authority must escalate rather than be guessed.", decision: "escalate", source: "authority-policy", changeTypes: ["missing_evidence", "conflicting_policy", "unresolved_risk"] },
  { id: "surface-material", text: "Material style changes, policy exceptions, and unusual but reversible changes should be surfaced for human attention.", decision: "surface", source: "attention-policy", changeTypes: ["material_style_change", "unusual_change", "policy_exception"] },
  { id: "pass-formatting", text: "Formatting-only changes and non-material style changes that preserve meaning and audience can pass without human rereading when already verified.", decision: "auto_pass", source: "attention-policy", changeTypes: ["formatting_only", "non_material_style_change"] },
  { id: "pass-approved-personalization", text: "Approved personalization within an existing audience and explicit policy can pass while remaining traceable.", decision: "auto_pass", source: "attention-policy", changeTypes: ["approved_personalization"] },
];

export function evidenceVersion(evidence: AuthorityEvidence[] = AUTHORITY_EVIDENCE): string {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 12);
}
