# Changelog

All notable changes to this reference implementation are documented here.

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
