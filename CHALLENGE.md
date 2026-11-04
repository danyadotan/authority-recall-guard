# Drawerrr AI Safety Challenge — reviewer guide

Prepared 4 November 2026. Authority Recall Guard, by Danya Dotan.
Maturity: working prototype; enforced contract-send boundary demonstrated end to end
with a local file sink. No real customer, email delivery or human login is claimed.

## Safety problem and the narrower implemented guarantee

A contract agent can disguise a new service-level promise as a formatting change.
The original Moss gate retrieves authority evidence and combines it with deterministic
classification, but can auto-pass if retrieval and the declared type are both wrong.
That counterexample remains in `tests/guarded-action.test.ts`.

The new `createContractExecutor` closes that route **for its contract-send capability**:
all sends need an approval grant for the exact recipient, subject, body and host
policy version. No retrieval result or agent-provided label can waive it. It does
not try to infer harmless contract sends. Draft formatting may be low-risk, but
sending a contract is always a separate approval-controlled effect.

The trusted host receives separate `agent` and `reviewer` capabilities. The agent
gets only `send`; the reviewer can inspect the exact payload, approve its SHA-256
digest, revoke a grant, and change policy version. Random 256-bit tokens are held
in host memory, expire, and are consumed before I/O. The transport receives an
immutable snapshot. A matching receipt is required before recording confirmation.
On ambiguous failure the token stays spent and delivery is marked unknown.

## Reproduce

Use Node 22 (CI) or newer:

```bash
npm ci
npm run check
npm run demo:contract -- /tmp/authority-contract-demo-new
```

Use a new empty output directory; reuse is rejected to prevent stale evidence.
Inspect `report.json` and the single `outbox/*.json` file. The demo verifies the
written payload and recomputes its digest independently. No Moss credentials,
network calls, email account, or paid service are needed for this safety scenario.
The `test` and deterministic `demo` scripts use Node's tsx import hook, avoiding
the CLI IPC listener restricted in some environments.

## Observed results (Node 24.22.1)

`npm run check` passed: typecheck, **47 tests**, deterministic ten-document demo.
The separate contract demonstration completed with four blocked attempts, one
local delivery, exact reviewed payload equality, and verified receipt digest.
Recorded output: [contract report](examples/contract-evidence/report.json).
The integration test independently repeats the full loop in a fresh directory.

| Contract executor test | Observed result |
|---|---|
| Unapproved contract labelled formatting, personalization, or auto-pass | No transport calls |
| Full loop: blocked → review → approval → send → receipt → replay blocked | One exact delivery |
| Body, recipient or subject changed after review (3 tests) | No transport calls |
| Forged/unknown token or approval for an unreviewed digest | Rejected |
| Expired grant at exact expiry | Rejected |
| Revoked grant or policy version changed | Rejected |
| 20 concurrent attempts with one grant | One dispatch; 19 rejected |
| Malformed payloads and header injection | No transport calls |
| Caller mutates input during dispatch | Original frozen snapshot sent |
| Transport throws after possible side effect | Delivery unknown; token spent; no auto-retry |
| Receipt digest mismatch | Never confirmed; replay blocked |
| Host restart loses grants | Old token rejected |
| End-to-end local file sink | Only approved exact payload written; independently read and checked |

There are 14 executor tests, 1 local delivery integration test, and 32 prior tests.
The prior tests include 12 mock gate-boundary blocking fixtures, a positive control,
and an unsafe-outcome characterization. **47 passes is not a 100% safety rate.**
The ten-document demo returns 8 auto-pass, 1 surface, 1 approval; it tests a different,
deterministic baseline and does not establish retrieval quality.

## Trust assumptions and limits

This library supplies an in-process capability boundary. A host must keep reviewer
methods and raw transport inaccessible to untrusted agent code. An agent that can
execute arbitrary code in the trusted host or obtain transport credentials can
bypass it. No OS sandbox, actual email API, real LLM adversarial campaign, or
production deployment was tested.

Approval in the demo is simulated by the trusted harness. Token possession is a
capability, not authenticated human identity. Real deployment needs an authenticated
reviewer UI presenting the exact payload and must not expose approval methods to
the agent. The same review can be explicitly approved more than once; each grant
permits at most one dispatch. There is no business-level duplicate suppression.

Grant state and audit are in memory. Restart fails closed but loses pending approvals
and audit history. Single-process concurrent reuse is tested; distributed workers,
shared durable grant state, crash recovery and cross-process races are not. A hung
transport has no deadline; delivery is not confirmed until it returns a matching
receipt. Revocation after dispatch cannot undo an already-started action. No
exactly-once external delivery, rollback or guarantee about a dishonest transport
is claimed. The local file read-back proves only local delivery in this harness.

All contract sends require approval by design. General low-risk automation still
uses the advisory gate; this executor is not automatically wired to the existing
MCP/HTTP tools. Unknown extra input fields are rejected. The permitted changeType
hint is ignored for authorization and excluded from the executed payload.

## Live Moss retrieval: implemented, not verified in this review

The existing labelled dataset and threshold sweep are available:

```bash
cp .env.example .env
# Add your own Moss credentials locally. Never commit them.
set -a
. ./.env
set +a
node --import tsx src/eval.ts
```

This creates/loads an index in your Moss project. No credentials were available
to this review. The latest main CI run inspected before these changes
(36745200479) was green but its Moss retrieval eval step was **skipped**. No live
recall, unsafe-auto-pass rate, general injection resistance, or latency is claimed.
The contract-send boundary is deliberately independent of retrieval quality.

## Challenge fit and disclosure

The contribution is an evidence-retrieval prototype plus a narrow enforceable
contract action boundary, reproducible failure cases and explicit counterexamples.
No confidential TAB materials, customer records, credentials or commercial strategy
are required. All examples are synthetic. The repository is already public under MIT.

Official brief, accessed 4 November 2026:
https://www.drawerrr.com/challenge/ai-safety-and-control/prevent-irreversible-autonomous-actions

Professional entrants are eligible for recognition, not the student cash pool.
The deadline is 15 November 2026. Submission grants Drawerrr a display/evaluation
license for challenge operations, mentoring and jury review; ownership stays with
the author. No confidentiality guarantee is assumed.
