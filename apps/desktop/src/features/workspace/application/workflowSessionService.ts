import type { WorkflowRecord, WorkflowSummary } from "@flux/shared";
import type { WorkspaceRepositoryPort } from "./workspaceRepositoryPort.js";

export interface RestoreWorkflowRequest {
  requestedWorkflowId: string | null;
  pendingNewWorkflow: boolean;
}

export type RestoreWorkflowResult =
  | {
      kind: "record";
      record: WorkflowRecord;
      preserveDirtyTitle: boolean;
    }
  | { kind: "draft" }
  | { kind: "empty" };

export interface SaveWorkflowRequest {
  workflowId: string | null;
  version: number;
  title: string;
  graph: unknown;
}

export interface WorkflowSessionService {
  restore(request: RestoreWorkflowRequest): Promise<RestoreWorkflowResult>;
  open(workflowId: string): Promise<WorkflowRecord>;
  save(request: SaveWorkflowRequest): Promise<WorkflowRecord>;
  publish(request: SaveWorkflowRequest): Promise<WorkflowRecord>;
}

function latestWorkflow(
  workflows: WorkflowSummary[],
): WorkflowSummary | null {
  return (
    [...workflows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
    null
  );
}

export function createWorkflowSessionService(
  repository: WorkspaceRepositoryPort,
): WorkflowSessionService {
  async function save(request: SaveWorkflowRequest): Promise<WorkflowRecord> {
    if (!request.workflowId) {
      return repository.create(request.title, request.graph);
    }
    return repository.update(request.workflowId, {
      title: request.title,
      graph: request.graph,
      expectedVersion: request.version,
    });
  }

  return {
    async restore(request) {
      if (request.requestedWorkflowId) {
        return {
          kind: "record",
          record: await repository.get(request.requestedWorkflowId),
          preserveDirtyTitle: false,
        };
      }
      if (request.pendingNewWorkflow) return { kind: "draft" };

      const latest = latestWorkflow(await repository.list());
      if (!latest) return { kind: "empty" };
      return {
        kind: "record",
        record: await repository.get(latest.id),
        preserveDirtyTitle: true,
      };
    },

    open(workflowId) {
      return repository.get(workflowId);
    },

    save,

    async publish(request) {
      const saved = await save(request);
      return repository.publish(saved.id);
    },
  };
}
