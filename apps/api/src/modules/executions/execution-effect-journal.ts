import type { ExecutionEffectJournal } from "@flux/workflow-runtime";
import { ExecutionsRepository } from "../../database/repositories/executions.repository";

/** Keeps the runtime independent of the concrete cloud persistence backend. */
export function createExecutionEffectJournal(
  executions: ExecutionsRepository,
): ExecutionEffectJournal {
  return {
    begin: (invocation) => executions.beginEffect(invocation),
    complete: (invocation, result) =>
      executions.completeEffect(invocation, result),
    fail: (invocation, error) => executions.failEffect(invocation, error),
  };
}
