import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAction } from "../src/gate.js";
import { MossAuthorityRetriever } from "../src/retrieval.js";

type Request = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: { query?: unknown; changeType?: unknown };
};

type Response = {
  status(code: number): Response;
  json(body: unknown): Response;
};

if (process.env.VERCEL && !process.env.MOSS_MODEL_CACHE_DIR) process.env.MOSS_MODEL_CACHE_DIR = join(tmpdir(), "moss-models");

let retriever: MossAuthorityRetriever | undefined;
let ready: Promise<void> | undefined;

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = process.env.GUARD_API_TOKEN;
  if (token && req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: "Unauthorized" });
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query || query.length > 500) return res.status(400).json({ error: "Query must be 1-500 characters." });
  const changeType = typeof req.body?.changeType === "string" && req.body.changeType.trim() ? req.body.changeType.trim() : undefined;
  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_PROJECT_KEY;
  if (!projectId || !projectKey) return res.status(503).json({ error: "Moss credentials are not configured on this deployment." });
  try {
    if (!retriever || !ready) {
      retriever = MossAuthorityRetriever.fromCredentials(projectId, projectKey);
      ready = retriever.initialize();
    }
    await ready;
    const result = await checkAction({ action: query, changeType }, retriever);
    return res.status(200).json({ ...result, engine: "Moss in-memory hybrid retrieval" });
  } catch (error) {
    retriever = undefined;
    ready = undefined;
    console.error(error);
    return res.status(500).json({ error: "Authority check failed; treat as escalate." });
  }
}
