# Architecture

```mermaid
flowchart LR
  A[Verified agent artifact] --> Q[Context + proposed action query]
  P[Authority and attention policy] --> M[(Moss in-memory hybrid index)]
  Q --> M
  M --> E[Ranked evidence with score and latency]
  E --> G{Conservative decision gate}
  G -->|explicit authority required| R[require_approval]
  G -->|missing or weak evidence| X[escalate]
  G -->|material reversible change| S[surface]
  G -->|approved low-risk change| O[auto_pass]
  R --> T[Trace: evidence ID, source, score, reason]
  X --> T
  S --> T
  O --> T
```

Moss is the retrieval layer, not a decorative dependency. Policy documents are indexed with decision metadata, loaded in memory, and queried with hybrid semantic/keyword search. The gate enforces safe precedence after retrieval and fails closed below the score threshold.
