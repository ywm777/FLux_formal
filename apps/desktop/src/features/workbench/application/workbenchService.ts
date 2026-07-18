import type { WorkflowRecord } from "@flux/shared";
import type { WorkspaceRepositoryPort } from "../../workspace/application/workspaceRepositoryPort.js";
import type { WorkflowFilePort } from "./workflowFilePort.js";

export interface WorkbenchService {
  exportWorkflow(workflowId: string): Promise<void>;
  importWorkflow(source: string): Promise<WorkflowRecord>;
}

/** Coordinates workbench persistence without exposing adapters to React. */
export function createWorkbenchService(
  repository: WorkspaceRepositoryPort,
  files: WorkflowFilePort,
): WorkbenchService {
  return {
    async exportWorkflow(workflowId) {
      files.download(await repository.get(workflowId));
    },

    async importWorkflow(source) {
      const imported = files.parse(source);
      return repository.importLocal({
        title: imported.title,
        tags: imported.tags,
        graph: imported.graph,
      });
    },
  };
}
