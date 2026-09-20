# Authority Recall Guard - product requirements

## Problem
AI agents can retrieve task context quickly while still missing the authority evidence that decides whether an action may proceed. When permission, audience, or commitment context is absent, a plausible answer can become an unsafe action.

## User
Teams building agents that send messages, change permissions, make commitments, or complete multi-step work across interruptions.

## Product
Authority Recall Guard retrieves the most relevant authority and attention policy in real time, then applies a conservative precedence rule: require approval, escalate, surface, auto-pass. Low-confidence retrieval fails closed.

## Moss requirement
Moss holds the policy evidence in an in-memory hybrid index. Each decision reports retrieval latency, evidence ID, source, score, and reason. This makes the hot path inspectable and suitable for conversational or multi-agent workflows.

## Success criteria
- A commercial or financial commitment retrieves approval evidence and never auto-passes.
- Unknown or weak evidence escalates.
- Query latency is measured from the real Moss call.
- Existing Execution Hygiene tests remain green.
- The demo is reproducible from a public repository with Moss credentials.

## Non-goals
This prototype does not infer identity, grant permission, execute downstream actions, or replace source-of-truth verification.
