import type { WorkflowSummary } from "@flux/shared";

export function getLatestWorkflowSummary(
  workflows: WorkflowSummary[],
): WorkflowSummary | null {
  return (
    [...workflows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
    null
  );
}
