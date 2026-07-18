import { WORKFLOW_STATUS, type WorkflowRecord } from "@flux/shared";
import { ApiError, cloudWorkflowApi } from "./api.js";
import { localWorkspaceRepository } from "./localWorkspaceRepository.js";
import { useWorkspaceStore } from "../store/workspaceStore.js";
import {
  WorkflowVersionConflictError,
  type WorkspaceRepositoryPort,
} from "../features/workspace/application/workspaceRepositoryPort.js";

function isLocal(): boolean {
  return useWorkspaceStore.getState().kind === "local";
}

export const workspaceRepository: WorkspaceRepositoryPort = {
  list: () =>
    isLocal() ? localWorkspaceRepository.list() : cloudWorkflowApi.list(),

  get: (id: string) =>
    isLocal() ? localWorkspaceRepository.get(id) : cloudWorkflowApi.get(id),

  create: (title: string, graph: unknown, tags?: string[]) =>
    isLocal()
      ? localWorkspaceRepository.create(title, graph, tags)
      : cloudWorkflowApi.create(title, graph, tags),

  async update(id, patch) {
    if (isLocal()) return localWorkspaceRepository.update(id, patch);

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
    isLocal()
      ? localWorkspaceRepository.setStatus(id, WORKFLOW_STATUS.PUBLISHED)
      : cloudWorkflowApi.publish(id),

  favorite: (id: string, isFavorite: boolean) =>
    isLocal()
      ? localWorkspaceRepository.favorite(id, isFavorite)
      : cloudWorkflowApi.favorite(id, isFavorite),

  remove: (id: string) =>
    isLocal()
      ? localWorkspaceRepository.remove(id)
      : cloudWorkflowApi.remove(id),

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
