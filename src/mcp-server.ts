import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { checkAction } from "./gate.ts";
import { MossAuthorityRetriever } from "./retrieval.ts";

const projectId = process.env.MOSS_PROJECT_ID;
const projectKey = process.env.MOSS_PROJECT_KEY;
if (!projectId || !projectKey) throw new Error("Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY.");

const retriever = MossAuthorityRetriever.fromCredentials(projectId, projectKey);
let ready: Promise<void> | undefined;

function ensureReady(): Promise<void> {
  ready ??= retriever.initialize().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

const decision = z.enum(["auto_pass", "surface", "require_approval", "escalate"]);

const server = new McpServer({ name: "authority-recall-guard", version: "0.3.0" });

server.registerTool(
  "check_action",
  {
    title: "Check action authority",
    description:
      "Call BEFORE any side-effecting action (sending messages, changing access or recipients, making commercial, financial, or legal commitments). " +
      "Returns auto_pass, surface, require_approval, or escalate with the evidence behind it. Only proceed on auto_pass; " +
      "on require_approval obtain explicit human approval; on surface show the change to a human; on escalate stop and ask.",
    inputSchema: {
      action: z.string().trim().min(1).max(500).describe("The proposed action, in plain language, including what changes and for whom."),
      changeType: z.string().trim().min(1).optional().describe(
        "Optional declared change type from policy (e.g. formatting_only, approved_personalization, commercial_commitment). Required for auto_pass."
      ),
    },
    outputSchema: {
      traceId: z.string(),
      decision,
      reason: z.string(),
      retrievalDecision: decision,
      policyDecision: decision.optional(),
      matched: z.array(z.string()),
      policyVersion: z.string(),
      latencyMs: z.number(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ action, changeType }) => {
    try {
      await ensureReady();
      const result = await checkAction({ action, changeType }, retriever);
      const structuredContent = {
        traceId: result.traceId,
        decision: result.decision,
        reason: result.reason,
        retrievalDecision: result.retrievalDecision,
        policyDecision: result.policyDecision,
        matched: result.matched,
        policyVersion: result.policyVersion,
        latencyMs: result.latencyMs,
      };
      console.error(JSON.stringify(result));
      return { content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
    } catch (error) {
      console.error(error);
      return {
        isError: true,
        content: [{ type: "text", text: "Authority check failed. Treat this action as escalate: do not proceed without a human." }],
      };
    }
  }
);

await server.connect(new StdioServerTransport());
