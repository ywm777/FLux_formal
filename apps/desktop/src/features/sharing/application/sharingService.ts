import type {
  SharedWorkflow,
  WorkflowRecord,
  WorkflowShareInfo,
} from "@flux/shared";
import type { WorkspaceRepositoryPort } from "../../workspace/application/workspaceRepositoryPort.js";
import type { WorkflowFilePort } from "../../workspace/application/workflowFilePort.js";
import type { CloudWorkflowSharingPort } from "./cloudWorkflowSharingPort.js";

export type ShareWorkspaceKind = "local" | "cloud";

export interface EnableShareResult {
  share: WorkflowShareInfo;
  cloudWorkflowId: string | null;
}

export interface SharingService {
  getShare(workflowId: string): Promise<WorkflowShareInfo | null>;
  enableShare(
    workflowId: string,
    workspaceKind: ShareWorkspaceKind,
  ): Promise<EnableShareResult>;
  exportWorkflow(workflowId: string): Promise<void>;
  disableShare(workflowId: string): Promise<void>;
  getShared(shareId: string): Promise<SharedWorkflow>;
  copyShared(shareId: string): Promise<WorkflowRecord>;
}

/** Owns local/cloud share orchestration independently of dialog state. */
export function createSharingService(
  repository: WorkspaceRepositoryPort,
  files: WorkflowFilePort,
  cloud: CloudWorkflowSharingPort,
): SharingService {
  return {
    getShare(workflowId) {
      return cloud.getShare(workflowId);
    },

    async enableShare(workflowId, workspaceKind) {
      if (workspaceKind === "cloud") {
        return {
          share: await cloud.enableShare(workflowId),
          cloudWorkflowId: null,
        };
      }

      const localRecord = await repository.get(workflowId);
      const cloudRecord = await cloud.createWorkflow(
        localRecord.title,
        localRecord.graph,
        localRecord.tags,
      );
      return {
        share: await cloud.enableShare(cloudRecord.id),
        cloudWorkflowId: cloudRecord.id,
      };
    },

    async exportWorkflow(workflowId) {
      files.download(await repository.get(workflowId));
    },

    disableShare(workflowId) {
      return cloud.disableShare(workflowId);
    },

    getShared(shareId) {
      return cloud.getShared(shareId);
    },

    copyShared(shareId) {
      return cloud.copyShared(shareId);
    },
  };
}
