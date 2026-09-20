import fs from "node:fs";
import path from "node:path";

import {
  classify,
  type Artifact,
  type Policy,
} from "./hygiene.ts";

type Input = {
  scenario: string;
  verifiedBeforeHygiene: boolean;
  artifacts: Artifact[];
};

const root = process.cwd();

const policy: Policy = JSON.parse(
  fs.readFileSync(
    path.join(root, "config", "policy.json"),
    "utf8"
  )
);

const input: Input = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "examples",
      "ten-documents",
      "input.json"
    ),
    "utf8"
  )
);

if (!input.verifiedBeforeHygiene) {
  throw new Error(
    "Execution Hygiene Agent only accepts work that has already been verified."
  );
}

const results = input.artifacts.map((artifact) =>
  classify(artifact, policy)
);

const summary = {
  artifactsReceived: results.length,
  autoPassed: results.filter(
    (result) => result.decision === "auto_pass"
  ).length,
  surfaced: results.filter(
    (result) => result.decision === "surface"
  ).length,
  requireApproval: results.filter(
    (result) => result.decision === "require_approval"
  ).length,
  escalated: results.filter(
    (result) => result.decision === "escalate"
  ).length,
};

const humanReviewSet = results.filter(
  (result) =>
    result.decision === "surface" ||
    result.decision === "require_approval" ||
    result.decision === "escalate"
);

console.log("\nExecution Hygiene Agent\n");

console.log(input.scenario);

console.log("\nSummary:");
console.table(summary);

console.log("\nHuman review set:");
console.table(humanReviewSet);

console.log(
  `\n${summary.autoPassed} of ${summary.artifactsReceived} artifacts required no human re-reading.`
);

console.log(
  `${humanReviewSet.length} items reached the human attention layer.\n`
);
