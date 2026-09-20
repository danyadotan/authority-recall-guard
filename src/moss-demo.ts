import { MossAuthorityRetriever, decideFromEvidence } from "./retrieval.ts";

const projectId = process.env.MOSS_PROJECT_ID;
const projectKey = process.env.MOSS_PROJECT_KEY;
if (!projectId || !projectKey) throw new Error("Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY.");

const query = process.argv.slice(2).join(" ") || "Send a contract update that adds a four-hour response-time promise";
const retriever = new MossAuthorityRetriever(projectId, projectKey);
await retriever.initialize();
const result = await retriever.retrieve(query);
const decision = decideFromEvidence(result);
console.log(JSON.stringify({ product: "Authority Recall Guard", retrieval: "Moss in-memory hybrid search", ...result, ...decision }, null, 2));
