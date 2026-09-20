# Authority Recall Guard

**Moss-backed, real-time retrieval of authority evidence for safer AI agent execution.**

Authority Recall Guard is a separate hackathon fork of Danya Dotan's Execution Hygiene Agent. It addresses one failure mode in AI-native work: an agent can remember the task while forgetting the permission, audience, or commitment boundary that determines whether it may act.

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

## Run

Requirements: Node.js 20.4+, a Moss project, and project credentials from https://portal.usemoss.dev.

```bash
npm install
cp .env.example .env
# Fill MOSS_PROJECT_ID and MOSS_PROJECT_KEY locally. Never commit .env.
export $(grep -v '^#' .env | xargs)
npm run demo:moss
npm run check
```

Or pass a different proposed action:

```bash
npm run demo:moss -- "Change the recipient and share private customer notes"
```

## Output contract

```json
{
  "product": "Authority Recall Guard",
  "retrieval": "Moss in-memory hybrid search",
  "query": "...",
  "latencyMs": 4.2,
  "evidence": [{ "id": "...", "score": 0.81, "decision": "require_approval" }],
  "decision": "require_approval",
  "reason": "Retrieved approval-commercial from authority-policy (0.810)."
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
