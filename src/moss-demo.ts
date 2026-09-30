import { checkAction } from "./gate.js";
import { MossAuthorityRetriever } from "./retrieval.js";

const projectId = process.env.MOSS_PROJECT_ID;
const projectKey = process.env.MOSS_PROJECT_KEY;
if (!projectId || !projectKey) throw new Error("Set MOSS_PROJECT_ID and MOSS_PROJECT_KEY.");

const args = process.argv.slice(2);
const changeTypeFlag = args.findIndex((arg) => arg.startsWith("--change-type="));
const changeType = changeTypeFlag >= 0 ? args.splice(changeTypeFlag, 1)[0].slice("--change-type=".length) : undefined;
const action = args.join(" ") || "Send a contract update that adds a four-hour response-time promise";

const retriever = MossAuthorityRetriever.fromCredentials(projectId, projectKey);
await retriever.initialize();
const result = await checkAction({ action, changeType }, retriever);
console.log(JSON.stringify({ product: "Authority Recall Guard", retrieval: "Moss in-memory hybrid search", ...result }, null, 2));
