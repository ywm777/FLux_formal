import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  EXECUTION_STATUS,
  type ExecutionDetail,
  type ExecutionLogEntry,
  type ExecutionStatus,
  type ExecutionSummary,
  type NodeRunRecord,
} from "@flux/shared";
import {
  CreateExecutionInput,
  type ExecutionControlMode,
  type ExecutionControlRequest,
  type ExecutionResumeState,
  ExecutionsRepository,
} from "../repositories/executions.repository";
import type {
  EffectJournalBeginResult,
  ExecutionCheckpoint,
  ExecutionEffectInvocation,
  ExecutionEffectRecord,
} from "@flux/workflow-runtime";
import {
  assertEffectIdentity,
  normalizeEffectError,
  pendingEffect,
} from "../repositories/execution-effect";

interface StoredExecution extends ExecutionDetail {
  graphSnapshot: unknown;
  checkpoint?: ExecutionCheckpoint;
  controlMode?: ExecutionControlMode;
  controlRequestedAt?: string;
  workerToken?: string;
  leaseUntil?: string;
  effects: ExecutionEffectRecord[];
}

function toSummary(detail: ExecutionDetail): ExecutionSummary {
  return {
    id: detail.id,
    workflowId: detail.workflowId,
    status: detail.status,
    startedAt: detail.startedAt,
    finishedAt: detail.finishedAt,
  };
}

@Injectable()
export class InMemoryExecutionsRepository extends ExecutionsRepository {
  private readonly store = new Map<string, StoredExecution>();

  async create(input: CreateExecutionInput): Promise<ExecutionDetail> {
    const detail: StoredExecution = {
      id: randomUUID(),
      workflowId: input.workflowId,
      ownerId: input.ownerId,
      status: EXECUTION_STATUS.RUNNING,
      order: [],
      runs: [],
      logs: [],
      startedAt: new Date().toISOString(),
      graphSnapshot: structuredClone(input.graphSnapshot),
      effects: [],
    };
    this.store.set(detail.id, detail);
    const created = structuredClone(detail);
    delete (created as Partial<StoredExecution>).graphSnapshot;
    delete created.checkpoint;
    delete (created as Partial<StoredExecution>).effects;
    return created;
  }

  async setOrder(id: string, order: string[]): Promise<void> {
    const detail = this.store.get(id);
    if (detail) detail.order = order;
  }

  async appendLog(id: string, entry: ExecutionLogEntry): Promise<void> {
    this.store.get(id)?.logs.push(entry);
  }

  async upsertNodeRun(id: string, run: NodeRunRecord): Promise<void> {
    const detail = this.store.get(id);
    if (!detail) return;
    const index = detail.runs.findIndex((r) => r.nodeId === run.nodeId);
    if (index >= 0) detail.runs[index] = run;
    else detail.runs.push(run);
  }

  async finalize(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void> {
    const detail = this.store.get(id);
    if (!detail) return;
    detail.status = status;
    detail.finishedAt = new Date().toISOString();
    if (error) detail.error = error;
  }

  async markStatus(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void> {
    const detail = this.store.get(id);
    if (!detail) return;
    detail.status = status;
    if (status === EXECUTION_STATUS.RUNNING || status === EXECUTION_STATUS.PAUSED) {
      delete detail.finishedAt;
    }
    if (error) detail.error = error;
    else delete detail.error;
  }

  async transitionStatus(
    id: string,
    from: ExecutionStatus,
    to: ExecutionStatus,
  ): Promise<boolean> {
    const detail = this.store.get(id);
    if (!detail || detail.status !== from) return false;
    detail.status = to;
    if (to === EXECUTION_STATUS.RUNNING || to === EXECUTION_STATUS.PAUSED) {
      delete detail.finishedAt;
    }
    delete detail.error;
    return true;
  }

  async requestControl(
    id: string,
    mode: ExecutionControlMode,
  ): Promise<boolean> {
    const detail = this.store.get(id);
    if (!detail || detail.status !== EXECUTION_STATUS.RUNNING) return false;
    detail.controlMode = mode;
    detail.controlRequestedAt = new Date().toISOString();
    return true;
  }

  async getControlRequest(id: string): Promise<ExecutionControlRequest | null> {
    const detail = this.store.get(id);
    return detail?.controlMode && detail.controlRequestedAt
      ? { mode: detail.controlMode, requestedAt: detail.controlRequestedAt }
      : null;
  }

  async clearControlRequest(id: string): Promise<void> {
    const detail = this.store.get(id);
    if (!detail) return;
    delete detail.controlMode;
    delete detail.controlRequestedAt;
  }

  async claimLease(id: string, token: string, leaseMs: number): Promise<boolean> {
    const detail = this.store.get(id);
    if (!detail || detail.status !== EXECUTION_STATUS.RUNNING) return false;
    const expired = !detail.leaseUntil || Date.parse(detail.leaseUntil) <= Date.now();
    if (detail.workerToken && detail.workerToken !== token && !expired) return false;
    detail.workerToken = token;
    detail.leaseUntil = new Date(Date.now() + leaseMs).toISOString();
    return true;
  }

  async renewLease(id: string, token: string, leaseMs: number): Promise<boolean> {
    const detail = this.store.get(id);
    if (
      !detail ||
      detail.workerToken !== token
    ) return false;
    detail.leaseUntil = new Date(Date.now() + leaseMs).toISOString();
    return true;
  }

  async releaseLease(id: string, token: string): Promise<void> {
    const detail = this.store.get(id);
    if (!detail || detail.workerToken !== token) return;
    delete detail.workerToken;
    delete detail.leaseUntil;
  }

  async saveCheckpoint(
    id: string,
    checkpoint: ExecutionCheckpoint,
  ): Promise<void> {
    const detail = this.store.get(id);
    if (detail) detail.checkpoint = structuredClone(checkpoint);
  }

  async getResumeState(id: string): Promise<ExecutionResumeState | null> {
    const detail = this.store.get(id);
    if (!detail) return null;
    return {
      graphSnapshot: structuredClone(detail.graphSnapshot),
      checkpoint: detail.checkpoint
        ? structuredClone(detail.checkpoint)
        : undefined,
    };
  }

  async beginEffect(
    invocation: ExecutionEffectInvocation,
  ): Promise<EffectJournalBeginResult> {
    const detail = this.store.get(invocation.metadata.executionId);
    if (!detail) throw new Error("副作用所属执行不存在");
    const existing = detail.effects.find((effect) => effect.id === invocation.id);
    if (!existing) {
      detail.effects.push(pendingEffect(invocation));
      return { kind: "execute" };
    }
    assertEffectIdentity(existing, invocation);
    if (existing.status === "completed") {
      return { kind: "replay", result: structuredClone(existing.result) };
    }
    existing.status = "pending";
    existing.metadata = structuredClone(invocation.metadata);
    delete existing.error;
    existing.updatedAt = new Date().toISOString();
    return { kind: "execute" };
  }

  async completeEffect(
    invocation: ExecutionEffectInvocation,
    result: unknown,
  ): Promise<void> {
    const detail = this.store.get(invocation.metadata.executionId);
    const existing = detail?.effects.find((effect) => effect.id === invocation.id);
    if (!existing) throw new Error("副作用 journal 记录不存在");
    assertEffectIdentity(existing, invocation);
    existing.status = "completed";
    existing.result = structuredClone(result);
    delete existing.error;
    existing.updatedAt = new Date().toISOString();
  }

  async failEffect(
    invocation: ExecutionEffectInvocation,
    error: string,
  ): Promise<void> {
    const detail = this.store.get(invocation.metadata.executionId);
    const existing = detail?.effects.find((effect) => effect.id === invocation.id);
    if (!existing) throw new Error("副作用 journal 记录不存在");
    assertEffectIdentity(existing, invocation);
    if (existing.status === "completed") return;
    existing.status = "failed";
    existing.error = normalizeEffectError(error);
    existing.updatedAt = new Date().toISOString();
  }

  async listEffects(executionId: string): Promise<ExecutionEffectRecord[]> {
    return structuredClone(this.store.get(executionId)?.effects ?? []);
  }

  async findById(id: string): Promise<ExecutionDetail | null> {
    const detail = this.store.get(id);
    if (!detail) return null;
    const copy = structuredClone(detail);
    delete (copy as Partial<StoredExecution>).graphSnapshot;
    delete copy.checkpoint;
    delete copy.controlMode;
    delete copy.controlRequestedAt;
    delete copy.workerToken;
    delete copy.leaseUntil;
    delete (copy as Partial<StoredExecution>).effects;
    return copy;
  }

  async getLogs(id: string): Promise<ExecutionLogEntry[]> {
    return [...(this.store.get(id)?.logs ?? [])];
  }

  async listByWorkflow(workflowId: string): Promise<ExecutionSummary[]> {
    return [...this.store.values()]
      .filter((d) => d.workflowId === workflowId)
      .map(toSummary);
  }

  async listByOwner(ownerId: string): Promise<ExecutionSummary[]> {
    return [...this.store.values()]
      .filter((d) => d.ownerId === ownerId)
      .map(toSummary);
  }
}
