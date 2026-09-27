# Authority Recall Guard

**Moss-backed, real-time retrieval of authority evidence for safer AI agent execution.**

Authority Recall Guard extends Danya Dotan's [Execution Hygiene Agent] (https://github.com/danyadotan/execution-hygiene-agent) as a separate technical prototype. 
It addresses one failure mode in AI-native work: an agent can remember the task while forgetting the permission, audience, or commitment boundary that determines whether it may act.

The guard uses Moss as its retrieval layer. It indexes authority and attention policy, loads the index in memory, and retrieves the evidence relevant to a proposed action. A conservative gate then applies this precedence:

```text
require_approval > escalate > surface > auto_pass
```

Weak or missing evidence fails closed to `escalate`. Every decision returns the evidence ID, source, similarity score, latency, and reason.

## Why Moss

This is a hot-path decision in conversational and multi-agent workflows. A network round trip for every policy lookup adds delay, while stale or missing context creates safety failures. Moss provides in-memory hybrid semantic and keyword retrieval after the index is loaded, designed for sub-10ms queries on supported hardware.

Moss is not included cosmetically. `src/retrieval.ts` uses `@moss-js/moss` to create/load the policy index and execute every retrieval. `src/moss-demo.ts` reports the measured duration of the real Moss query.

## Demo scenario

Proposed action:

> Send a contract update that adds a four-hour response-time promise.

Expected result: Moss retrieves the commercial-commitment authority policy and the guard returns `require_approval`. An unrelated or low-confidence query returns `escalate`, never `auto_pass`.

## How the gate decides

1. Moss retrieves the top authority evidence for the proposed action.
2. If a `changeType` is declared, the deterministic policy in `config/policy.json` classifies it too.
3. The final decision is the **more severe** of the two. Retrieval alone never auto-passes: `auto_pass` requires a declared `changeType` that policy also auto-passes.

The Moss index name includes a hash of the evidence (`authority-recall-guard-<policyVersion>`), so editing `src/evidence.ts` builds and loads a fresh index instead of serving stale policy.

## Run

Requirements: Node.js 20.10+, a Moss project, and project credentials from https://portal.usemoss.dev.

```bash
npm install
npm run check          # typecheck + unit tests + deterministic demo (no credentials needed)

cp .env.example .env
# Fill MOSS_PROJECT_ID and MOSS_PROJECT_KEY locally. Never commit .env.
set -a && . ./.env && set +a
npm run demo:moss
npm run demo:moss -- "Change the recipient and share private customer notes"
npm run demo:moss -- --change-type=formatting_only "Adjust heading spacing"
npm run eval           # labelled retrieval eval + threshold sweep; fails if approval recall < 100%
```

## MCP server

`npm run mcp` starts a stdio MCP server that exposes one read-only tool, `check_action({ action, changeType? })`. Agents should call it before any side-effecting action and continue only on `auto_pass`.

```json
{
  "mcpServers": {
    "authority-recall-guard": {
      "command": "npx",
      "args": ["tsx", "/path/to/authority-recall-guard/src/mcp-server.ts"],
      "env": { "MOSS_PROJECT_ID": "...", "MOSS_PROJECT_KEY": "..." }
    }
  }
}
```

If the check fails, the tool returns an error that tells the agent to treat the action as `escalate`. The full trace for each decision is written to stderr as JSON.

## HTTP API

`POST /api/query` with `{ "query": "...", "changeType": "optional" }`. Set `GUARD_API_TOKEN` on the deployment to require `Authorization: Bearer <token>`.

## Output contract

```json
{
  "traceId": "4c1e...",
  "timestamp": "2026-09-26T22:00:00.000Z",
  "policyVersion": "a1b2c3d4e5f6",
  "indexName": "authority-recall-guard-a1b2c3d4e5f6",
  "query": "...",
  "decision": "require_approval",
  "reason": "Retrieved approval-commercial from authority-policy (0.810).",
  "retrievalDecision": "require_approval",
  "policyDecision": "auto_pass",
  "matched": ["approval-commercial"],
  "latencyMs": 4.2,
  "evidence": [{ "id": "approval-commercial", "score": 0.81, "decision": "require_approval", "source": "authority-policy" }]
}
```

Actual scores and latency depend on the Moss model, hardware, and query.

## Architecture and product notes

- [Architecture and retrieval flow](ARCHITECTURE.md)
- [Product requirements](PRD.md)
- [Original Execution Hygiene Agent](https://github.com/danyadotan/execution-hygiene-agent)

## Safety boundary

This prototype retrieves evidence. It does not authenticate a person, create permission, execute the action, or replace a source of truth. Upstream verification and downstream governed execution remain required.

## License

MIT © 2026 Danya Dotan.
