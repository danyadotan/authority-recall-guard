export type Policy = {
  autoPass: string[];
  surface: string[];
  requireHumanApproval: string[];
  escalate: string[];
};

export type Artifact = {
  id: string;
  changeType: string;
  change: string;
};

export type Decision =
  | "auto_pass"
  | "surface"
  | "require_approval"
  | "escalate";

export type Result = {
  id: string;
  decision: Decision;
  reason: string;
  changeType: string;
};

export function classify(
  artifact: Artifact,
  policy: Policy
): Result {
  if (policy.requireHumanApproval.includes(artifact.changeType)) {
    return {
      id: artifact.id,
      decision: "require_approval",
      reason: "Policy requires explicit human authority for this change type.",
      changeType: artifact.changeType,
    };
  }

  if (policy.escalate.includes(artifact.changeType)) {
    return {
      id: artifact.id,
      decision: "escalate",
      reason: "The item cannot be safely resolved from the available evidence.",
      changeType: artifact.changeType,
    };
  }

  if (policy.surface.includes(artifact.changeType)) {
    return {
      id: artifact.id,
      decision: "surface",
      reason: "The change is material enough to deserve human attention.",
      changeType: artifact.changeType,
    };
  }

  if (policy.autoPass.includes(artifact.changeType)) {
    return {
      id: artifact.id,
      decision: "auto_pass",
      reason: "The change is covered by approved policy and needs no human review.",
      changeType: artifact.changeType,
    };
  }

  return {
    id: artifact.id,
    decision: "escalate",
    reason: "No matching policy rule exists for this change type.",
    changeType: artifact.changeType,
  };
}
