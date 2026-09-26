# Changelog

All notable changes to this reference implementation are documented here.

## [0.3.0] - 2026-09-26

### Added

- `check_action` MCP server (`npm run mcp`) so agents can call the guard before side-effecting tools.
- Combined gate (`src/gate.ts`): final decision is the max severity of retrieval and deterministic policy; retrieval alone can never auto-pass.
- Decision trace fields: `traceId`, `timestamp`, `policyVersion`, `indexName`, `matched`.
- `approval-legal` evidence; `config/policy.json` / evidence parity test.
- Labelled retrieval eval with threshold sweep (`npm run eval`).
- `.env.example`, `.gitignore`, GitHub Actions CI, optional `GUARD_API_TOKEN` for `/api/query`.

### Fixed

- Moss index name is versioned by evidence content, so policy edits are no longer served from a stale index.
- `/api/query` no longer stays broken after a failed initialization and no longer returns raw error messages.
- Unrecognized Moss metadata decisions are validated and treated as `escalate`.

## [0.2.0]

- Moss-backed authority retrieval, demo, and Vercel endpoint.

## [0.1.0] - 2026-09-19

First public reference release of Execution Hygiene Agent.

### Added

- Four explicit decision outcomes:
  - `auto_pass`
  - `surface`
  - `require_approval`
  - `escalate`
- Policy-driven classification of verified agent output.
- Fail-safe escalation for unknown change types.
- Explicit protection for required human approval.
- Traceable reason attached to every decision.
- Runnable 10-document example demonstrating the **10 → 8 → 2 → 1** reduction pattern.
- Safety tests for approval preservation, low-risk auto-pass, and unknown-change escalation.
- Integration test that locks the example scenario to its expected outcome.
- GitHub Actions CI.
- MIT License.
- TAB@Work context and execution-reliability framing.

### Scope

This release is a narrow reference primitive for reducing human review load after upstream verification. It is not the full TAB@Work execution-reliability architecture.

### Context

Live system framing: https://tab-at-work.com
