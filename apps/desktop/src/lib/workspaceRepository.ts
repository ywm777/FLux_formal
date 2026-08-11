import { WORKFLOW_STATUS, type WorkflowRecord } from "@flux/shared";
import { ApiError, cloudWorkflowApi } from "./api.js";
import { localWorkspaceRepository } from "./localWorkspaceRepository.js";
import {
  WorkflowVersionConflictError,
  type WorkspaceKind,
  type WorkspaceRepositoryPort,
} from "../features/workspace/application/workspaceRepositoryPort.js";

/**
 * Creates a repository with a fixed workspace target.
 *
 * The selected adapter is captured when the application composition root builds
 * the service graph. A request can therefore never switch from local to cloud
 * halfway through an operation because a global store changed underneath it.
 */
export function createWorkspaceRepository(
  kind: WorkspaceKind,
): WorkspaceRepositoryPort {
  const local = kind === "local";

  return {
    list: () => (local ? localWorkspaceRepository.list() : cloudWorkflowApi.list()),

    get: (id: string) => (local ? localWorkspaceRepository.get(id) : cloudWorkflowApi.get(id)),

    create: (title: string, graph: unknown, tags?: string[]) =>
      local
        ? localWorkspaceRepository.create(title, graph, tags)
        : cloudWorkflowApi.create(title, graph, tags),

    async update(id, patch) {
      if (local) return localWorkspaceRepository.update(id, patch);

      try {
        return await cloudWorkflowApi.update(id, patch);
      } catch (error) {
        const currentVersion =
          error instanceof ApiError ? error.details.currentVersion : undefined;
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.details.code === "WORKFLOW_VERSION_CONFLICT" &&
          typeof currentVersion === "number" &&
          typeof patch.expectedVersion === "number"
        ) {
          throw new WorkflowVersionConflictError(
            currentVersion,
            patch.expectedVersion,
          );
        }
        throw error;
      }
    },

    publish: (id: string) =>
      local
        ? localWorkspaceRepository.setStatus(id, WORKFLOW_STATUS.PUBLISHED)
        : cloudWorkflowApi.publish(id),

    favorite: (id: string, isFavorite: boolean) =>
      local
        ? localWorkspaceRepository.favorite(id, isFavorite)
        : cloudWorkflowApi.favorite(id, isFavorite),

    remove: (id: string) =>
      local ? localWorkspaceRepository.remove(id) : cloudWorkflowApi.remove(id),

    importLocal: (input: { title: string; graph: unknown; tags?: string[] }) =>
      localWorkspaceRepository.importRecord(input),

    async copyCloudRecordToLocal(record: WorkflowRecord): Promise<WorkflowRecord> {
      return localWorkspaceRepository.importRecord({
        title: record.title,
        tags: record.tags,
        graph: record.graph,
      });
    },
  };
}

/** @deprecated Prefer createWorkspaceRepository() at the composition root. */
export const workspaceRepository = createWorkspaceRepository("local");
