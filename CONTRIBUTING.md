# Contributing

Execution Hygiene Agent is intentionally small. Contributions should make the decision boundary clearer, safer, or easier to reuse without turning this repository into the full TAB@Work orchestration system.

## Before opening a pull request

Run:

```bash
npm install
npm run check
```

## Core invariants

Changes must preserve these behaviors:

1. Required human approval can never be suppressed.
2. Every classification returns a reason.
3. Auto-passed items remain traceable.
4. Unknown change types fail safe to escalation.
5. Attention reduction must never create or expand authority.
6. Hygiene consumes already-verified work; upstream verification is outside this primitive.

## Good contribution areas

- clearer policy contracts
- stronger safety tests
- additional example policies or scenarios
- typed interfaces that preserve the four decision outcomes
- documentation improvements
- adapters that do not weaken authority boundaries

## Keep out of scope

Please do not add:

- autonomous approval
- hidden suppression of required review
- model-evaluation logic presented as Hygiene
- source-of-truth storage
- broad orchestration that belongs in the larger TAB@Work architecture

## Pull requests

Keep changes focused and explain:

- what behavior changes
- why the change belongs in the Hygiene layer
- which invariant(s) it preserves or strengthens
- how the change was tested

By contributing, you agree that your contribution may be distributed under the repository's MIT License.
