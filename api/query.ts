import { MossAuthorityRetriever, decideFromEvidence } from "../src/retrieval.js";

let retriever: MossAuthorityRetriever | undefined;
let ready: Promise<void> | undefined;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query || query.length > 500) return res.status(400).json({ error: "Query must be 1-500 characters." });
  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_PROJECT_KEY;
  if (!projectId || !projectKey) return res.status(503).json({ error: "Moss credentials are not configured on this deployment." });
  try {
    if (!retriever) {
      retriever = new MossAuthorityRetriever(projectId, projectKey);
      ready = retriever.initialize();
    }
    await ready;
    const result = await retriever.retrieve(query);
    return res.status(200).json({ ...result, ...decideFromEvidence(result), engine: "Moss in-memory hybrid retrieval" });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Moss query failed" });
  }
}
