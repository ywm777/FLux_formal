import type {
  ExecutionDetail,
  ExecutionLogEntry,
  ExecutionStatus,
  ExecutionSummary,
  NodeRunRecord,
} from "@flux/shared";
import type {
  EffectJournalBeginResult,
  ExecutionCheckpoint,
  ExecutionEffectInvocation,
  ExecutionEffectRecord,
} from "@flux/workflow-runtime";

export type ExecutionControlMode = "terminate" | "pause";

export interface ExecutionControlRequest {
  mode: ExecutionControlMode;
  requestedAt: string;
}

export interface CreateExecutionInput {
  workflowId: string;
  ownerId: string;
  /** Immutable, prepared graph used by this execution only. */
  graphSnapshot: unknown;
}

export interface ExecutionResumeState {
  graphSnapshot: unknown;
  checkpoint?: ExecutionCheckpoint;
}

/** 执行记录、节点运行与日志的持久化抽象（内存 / TypeORM） */
export abstract class ExecutionsRepository {
  abstract create(input: CreateExecutionInput): Promise<ExecutionDetail>;
  abstract setOrder(id: string, order: string[]): Promise<void>;
  abstract appendLog(id: string, entry: ExecutionLogEntry): Promise<void>;
  abstract upsertNodeRun(id: string, run: NodeRunRecord): Promise<void>;
  abstract markStatus(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void>;
  /** Compare-and-set transition used to make approval resume single-winner. */
  abstract transitionStatus(
    id: string,
    from: ExecutionStatus,
    to: ExecutionStatus,
  ): Promise<boolean>;
  /** Persisted control intent observed by workers in every process. */
  abstract requestControl(
    id: string,
    mode: ExecutionControlMode,
  ): Promise<boolean>;
  abstract getControlRequest(id: string): Promise<ExecutionControlRequest | null>;
  abstract clearControlRequest(id: string): Promise<void>;
  /** Single-winner worker lease guarding an execution against duplicate delivery. */
  abstract claimLease(id: string, token: string, leaseMs: number): Promise<boolean>;
  abstract renewLease(id: string, token: string, leaseMs: number): Promise<boolean>;
  abstract releaseLease(id: string, token: string): Promise<void>;
  abstract saveCheckpoint(
    id: string,
    checkpoint: ExecutionCheckpoint,
  ): Promise<void>;
  abstract getResumeState(id: string): Promise<ExecutionResumeState | null>;
  /**
   * Durable effect journal. Implementations must reject an idempotency-key
   * collision whose immutable invocation identity does not match.
   */
  abstract beginEffect(
    invocation: ExecutionEffectInvocation,
  ): Promise<EffectJournalBeginResult>;
  abstract completeEffect(
    invocation: ExecutionEffectInvocation,
    result: unknown,
  ): Promise<void>;
  /** A late failure must never overwrite an already completed effect. */
  abstract failEffect(
    invocation: ExecutionEffectInvocation,
    error: string,
  ): Promise<void>;
  abstract listEffects(executionId: string): Promise<ExecutionEffectRecord[]>;
  abstract finalize(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void>;
  abstract findById(id: string): Promise<ExecutionDetail | null>;
  abstract getLogs(id: string): Promise<ExecutionLogEntry[]>;
  abstract listByWorkflow(workflowId: string): Promise<ExecutionSummary[]>;
  abstract listByOwner(ownerId: string): Promise<ExecutionSummary[]>;
}
