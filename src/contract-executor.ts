import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  to: z.string().email().max(254),
  subject: z.string().min(1).max(200).refine(s => !/[\r\n]/.test(s)),
  body: z.string().min(1).max(100_000),
  // An agent's self-classification is never authorization to send a contract.
  changeType: z.string().max(100).optional(),
}).strict();
export type Contract = Readonly<{ to: string; subject: string; body: string }>;
export type Receipt = Readonly<{ id: string; digest: string }>;
export type Review = Readonly<{ digest: string; contract: Contract; policyVersion: string }>;

function snapshot(input: unknown): Contract {
  const parsed = schema.parse(input);
  return Object.freeze({ to: parsed.to, subject: parsed.subject, body: parsed.body });
}
function digest(contract: Contract, policyVersion: string): string {
  return createHash("sha256").update(JSON.stringify({ policyVersion, ...contract })).digest("hex");
}

/** Trusted-host boundary. Give the agent ONLY agent; keep reviewer and transport
 * in the host process. Token possession is a capability, not human identity.
 * All contract sends require approval, regardless of Moss results or agent labels.
 */
export function createContractExecutor(options: {
  transport: (contract: Contract, digest: string) => Promise<Receipt>;
  policyVersion: string;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let policyVersion = options.policyVersion;
  const grants = new Map<string, { digest: string; expires: number; version: string }>();
  const reviews = new Map<string, Review>();
  const events: Array<Readonly<{ event: string; digest?: string }>> = [];
  const record = (event: string, digest?: string) => events.push(Object.freeze({ event, digest }));
  const reviewer = Object.freeze({
    // This host-only capability must sit behind real authentication in deployment.
    review(input: unknown): Review {
      const contract = snapshot(input);
      const review = Object.freeze({ contract, policyVersion, digest: digest(contract, policyVersion) });
      reviews.set(review.digest, review);
      record("reviewed", review.digest);
      return review;
    },
    approve(reviewDigest: string, ttlMs = 60_000): string {
      const review = reviews.get(reviewDigest);
      if (!review || review.policyVersion !== policyVersion) throw new Error("Review missing or stale");
      if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 300_000) throw new Error("Invalid approval lifetime");
      const token = randomBytes(32).toString("hex");
      grants.set(token, { digest: reviewDigest, expires: now() + ttlMs, version: policyVersion });
      record("approved", reviewDigest);
      return token;
    },
    revoke(token: string) { grants.delete(token); record("revoked"); },
    setPolicyVersion(version: string) {
      policyVersion = version; grants.clear(); reviews.clear(); record("policy_changed");
    },
    audit() { return events.map(e => ({ ...e })); },
  });
  const agent = Object.freeze({
    async send(input: unknown, token?: string): Promise<Receipt> {
      // Parse and copy before any await, so later caller mutation cannot change the send.
      const contract = snapshot(input);
      const actionDigest = digest(contract, policyVersion);
      const grant = typeof token === "string" ? grants.get(token) : undefined;
      if (!grant || grant.digest !== actionDigest || grant.version !== policyVersion || now() >= grant.expires) {
        record("blocked", actionDigest);
        throw new Error("Explicit approval required for this exact contract and recipient");
      }
      // Consume synchronously before I/O: concurrent/replayed calls cannot both send.
      // On ambiguous transport failure the token remains spent; never retry automatically.
      grants.delete(token!);
      record("dispatch_started", actionDigest);
      try {
        const receipt = await options.transport(contract, actionDigest);
        if (!receipt || !receipt.id || receipt.digest !== actionDigest) throw new Error("Receipt does not match action");
        record("confirmed", actionDigest);
        return Object.freeze({ ...receipt });
      } catch (error) {
        record("delivery_unknown", actionDigest);
        throw error;
      }
    },
  });
  return Object.freeze({ agent, reviewer });
}
