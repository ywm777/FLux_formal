import type {
  WorkflowRecord,
  WorkflowSummary,
  WorkflowStatus,
} from "@flux/shared";

export interface CreateWorkflowInput {
  id?: string;
  ownerId: string;
  workspaceId: string;
  title: string;
  tags?: string[];
  graph: unknown;
}

export interface UpdateWorkflowInput {
  title?: string;
  tags?: string[];
  graph?: unknown;
  /** 客户端已知版本号，用于乐观锁冲突检测 */
  expectedVersion?: number;
}

export class WorkflowVersionConflictError extends Error {
  constructor(
    readonly currentVersion: number,
    readonly expectedVersion: number,
  ) {
    super(
      `工作流版本冲突：当前 v${currentVersion}，提交基于 v${expectedVersion}`,
    );
    this.name = "WorkflowVersionConflictError";
  }
}

/** 工作流持久化抽象（内存 / TypeORM 两种实现） */
export abstract class WorkflowsRepository {
  abstract create(input: CreateWorkflowInput): Promise<WorkflowRecord>;
  abstract findById(id: string): Promise<WorkflowRecord | null>;
  abstract findByShareId(shareId: string): Promise<WorkflowRecord | null>;
  abstract listByOwner(ownerId: string): Promise<WorkflowSummary[]>;
  abstract listPublishedByOwner(ownerId: string): Promise<WorkflowSummary[]>;
  abstract listPublished(): Promise<WorkflowSummary[]>;
  abstract update(
    id: string,
    patch: UpdateWorkflowInput,
  ): Promise<WorkflowRecord | null>;
  abstract setStatus(
    id: string,
    status: WorkflowStatus,
  ): Promise<WorkflowRecord | null>;
  abstract setFavorite(
    id: string,
    isFavorite: boolean,
  ): Promise<WorkflowRecord | null>;
  abstract setShare(
    id: string,
    share: { shareId: string; sharedAt: string } | null,
  ): Promise<WorkflowRecord | null>;
  abstract remove(id: string): Promise<boolean>;
}
