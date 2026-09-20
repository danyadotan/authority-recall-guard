import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  classify,
  type Artifact,
  type Policy,
} from "../src/hygiene.ts";

const policy: Policy = {
  autoPass: [
    "formatting_only",
    "approved_personalization",
    "non_material_style_change",
  ],

  surface: [
    "material_style_change",
    "unusual_change",
    "policy_exception",
  ],

  requireHumanApproval: [
    "commercial_commitment",
    "legal_change",
    "permission_change",
    "financial_commitment",
  ],

  escalate: [
    "missing_evidence",
    "conflicting_policy",
    "unresolved_risk",
  ],
};

test(
  "required human approval can never be suppressed",
  () => {
    const result = classify(
      {
        id: "client-09",
        changeType: "commercial_commitment",
        change: "Added a 4-hour response-time commitment.",
      },
      policy
    );

    assert.equal(
      result.decision,
      "require_approval"
    );
  }
);

test(
  "approved low-risk changes can avoid human re-reading",
  () => {
    const result = classify(
      {
        id: "client-02",
        changeType: "formatting_only",
        change: "Heading spacing adjusted.",
      },
      policy
    );

    assert.equal(
      result.decision,
      "auto_pass"
    );
  }
);

test(
  "unknown change types fail safe by escalating",
  () => {
    const result = classify(
      {
        id: "client-11",
        changeType: "unknown_change",
        change: "An unrecognized change appeared.",
      },
      policy
    );

    assert.equal(
      result.decision,
      "escalate"
    );
  }
);

test(
  "the ten-document scenario preserves the 10 → 8 → 2 → 1 contract",
  () => {
    const root = process.cwd();

    const examplePolicy: Policy = JSON.parse(
      fs.readFileSync(path.join(root, "config", "policy.json"), "utf8")
    );

    const input: {
      verifiedBeforeHygiene: boolean;
      artifacts: Artifact[];
    } = JSON.parse(
      fs.readFileSync(
        path.join(root, "examples", "ten-documents", "input.json"),
        "utf8"
      )
    );

    const expected: {
      summary: {
        artifactsReceived: number;
        autoPassed: number;
        surfaced: number;
        requireApproval: number;
        escalated: number;
      };
      humanReviewSet: Array<{
        id: string;
        decision: string;
        reason: string;
      }>;
      autoPassed: string[];
    } = JSON.parse(
      fs.readFileSync(
        path.join(root, "examples", "ten-documents", "expected-output.json"),
        "utf8"
      )
    );

    assert.equal(input.verifiedBeforeHygiene, true);

    const results = input.artifacts.map((artifact) =>
      classify(artifact, examplePolicy)
    );

    const summary = {
      artifactsReceived: results.length,
      autoPassed: results.filter((result) => result.decision === "auto_pass").length,
      surfaced: results.filter((result) => result.decision === "surface").length,
      requireApproval: results.filter(
        (result) => result.decision === "require_approval"
      ).length,
      escalated: results.filter((result) => result.decision === "escalate").length,
    };

    assert.deepEqual(summary, expected.summary);

    const humanReviewSet = results
      .filter((result) => result.decision !== "auto_pass")
      .map(({ id, decision, reason }) => ({ id, decision, reason }));

    assert.deepEqual(humanReviewSet, expected.humanReviewSet);

    const autoPassed = results
      .filter((result) => result.decision === "auto_pass")
      .map((result) => result.id);

    assert.deepEqual(autoPassed, expected.autoPassed);
  }
);
