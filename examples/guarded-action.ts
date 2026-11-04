import { checkAction, type ActionCheck } from "../src/gate.js";
import type { MossAuthorityRetriever } from "../src/retrieval.js";

// Integration example, not a production permission boundary. The host must keep
// the actual tool inaccessible to the agent except through its trusted wrapper.
// No human-approval override is implemented: every non-auto-pass stops here.
export async function guardedAction(
  input: ActionCheck,
  retriever: MossAuthorityRetriever,
  execute: (checked: Readonly<ActionCheck>) => Promise<void>
): Promise<{ executed: boolean; decision: string }> {
  const checked = Object.freeze({ ...input });
  try {
    const result = await checkAction(checked, retriever);
    if (result.decision !== "auto_pass") return { executed: false, decision: result.decision };
  } catch {
    return { executed: false, decision: "escalate" };
  }
  await execute(checked);
  return { executed: true, decision: "auto_pass" };
}
