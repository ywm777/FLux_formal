import type {
  SharedWorkflow,
  WorkflowRecord,
  WorkflowShareInfo,
} from "@flux/shared";

export interface CloudWorkflowSharingPort {
  getShare(workflowId: string): Promise<WorkflowShareInfo | null>;
  createWorkflow(
    title: string,
    graph: unknown,
    tags?: string[],
  ): Promise<WorkflowRecord>;
  enableShare(workflowId: string): Promise<WorkflowShareInfo>;
  disableShare(workflowId: string): Promise<void>;
  getShared(shareId: string): Promise<SharedWorkflow>;
  copyShared(shareId: string): Promise<WorkflowRecord>;
}
