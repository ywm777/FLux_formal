import type { WorkflowRecord, WorkflowSummary } from "@flux/shared";

export interface SaveWorkflowPatch {
  title?: string;
  tags?: string[];
  graph?: unknown;
  expectedVersion?: number;
}

export interface ImportWorkflowInput {
  title: string;
  graph: unknown;
  tags?: string[];
}

export interface WorkspaceRepositoryPort {
  list(): Promise<WorkflowSummary[]>;
  get(id: string): Promise<WorkflowRecord>;
  create(
    title: string,
    graph: unknown,
    tags?: string[],
  ): Promise<WorkflowRecord>;
  update(id: string, patch: SaveWorkflowPatch): Promise<WorkflowRecord>;
  publish(id: string): Promise<WorkflowRecord>;
  favorite(id: string, isFavorite: boolean): Promise<WorkflowRecord>;
  remove(id: string): Promise<{ ok: boolean }>;
  importLocal(input: ImportWorkflowInput): Promise<WorkflowRecord>;
  copyCloudRecordToLocal(record: WorkflowRecord): Promise<WorkflowRecord>;
}

export class WorkflowVersionConflictError extends Error {
  readonly currentVersion: number;
  readonly expectedVersion: number;

  constructor(
    currentVersion: number,
    expectedVersion: number,
  ) {
    super(
      `工作流版本冲突：当前 v${currentVersion}，提交基于 v${expectedVersion}`,
    );
    this.name = "WorkflowVersionConflictError";
    this.currentVersion = currentVersion;
    this.expectedVersion = expectedVersion;
  }
}
