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
import { FileDb, type StoredFileExecution } from "./file-db";
import {
  assertEffectIdentity,
  normalizeEffectError,
  pendingEffect,
} from "../repositories/execution-effect";

function toSummary(d: ExecutionDetail): ExecutionSummary {
  return {
    id: d.id,
    workflowId: d.workflowId,
    status: d.status,
    startedAt: d.startedAt,
    finishedAt: d.finishedAt,
  };
}

@Injectable()
export class FileExecutionsRepository extends ExecutionsRepository {
  constructor(private readonly db: FileDb) {
    super();
  }

  private find(id: string): StoredFileExecution | undefined {
    return this.db.get().executions.find((e) => e.id === id);
  }

  async create(input: CreateExecutionInput): Promise<ExecutionDetail> {
    const detail: StoredFileExecution = {
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
    this.db.mutate((s) => s.executions.push(detail));
    const created = structuredClone(detail);
    delete created.graphSnapshot;
    delete created.checkpoint;
    delete created.effects;
    return created;
  }

  async setOrder(id: string, order: string[]): Promise<void> {
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      if (e) e.order = order;
    });
  }

  async appendLog(id: string, entry: ExecutionLogEntry): Promise<void> {
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      e?.logs.push(entry);
    });
  }

  async upsertNodeRun(id: string, run: NodeRunRecord): Promise<void> {
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      if (!e) return;
      const i = e.runs.findIndex((r) => r.nodeId === run.nodeId);
      if (i >= 0) e.runs[i] = run;
      else e.runs.push(run);
    });
  }

  async finalize(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void> {
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      if (!e) return;
      e.status = status;
      e.finishedAt = new Date().toISOString();
      if (error) e.error = error;
    });
  }

  async markStatus(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void> {
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      if (!e) return;
      e.status = status;
      if (status === EXECUTION_STATUS.RUNNING || status === EXECUTION_STATUS.PAUSED) {
        delete e.finishedAt;
      }
      if (error) e.error = error;
      else delete e.error;
    });
  }

  async transitionStatus(
    id: string,
    from: ExecutionStatus,
    to: ExecutionStatus,
  ): Promise<boolean> {
    let transitioned = false;
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      if (!e || e.status !== from) return;
      e.status = to;
      if (to === EXECUTION_STATUS.RUNNING || to === EXECUTION_STATUS.PAUSED) {
        delete e.finishedAt;
      }
      delete e.error;
      transitioned = true;
    });
    return transitioned;
  }

  async requestControl(
    id: string,
    mode: ExecutionControlMode,
  ): Promise<boolean> {
    let accepted = false;
    this.db.mutate((s) => {
      const execution = s.executions.find((item) => item.id === id);
      if (!execution || execution.status !== EXECUTION_STATUS.RUNNING) return;
      execution.controlMode = mode;
      execution.controlRequestedAt = new Date().toISOString();
      accepted = true;
    });
    return accepted;
  }

  async getControlRequest(id: string): Promise<ExecutionControlRequest | null> {
    const execution = this.find(id);
    return execution?.controlMode && execution.controlRequestedAt
      ? { mode: execution.controlMode, requestedAt: execution.controlRequestedAt }
      : null;
  }

  async clearControlRequest(id: string): Promise<void> {
    this.db.mutate((s) => {
      const execution = s.executions.find((item) => item.id === id);
      if (!execution) return;
      delete execution.controlMode;
      delete execution.controlRequestedAt;
    });
  }

  async claimLease(id: string, token: string, leaseMs: number): Promise<boolean> {
    let claimed = false;
    const now = Date.now();
    this.db.mutate((s) => {
      const execution = s.executions.find((item) => item.id === id);
      if (!execution || execution.status !== EXECUTION_STATUS.RUNNING) return;
      const expired = !execution.leaseUntil || Date.parse(execution.leaseUntil) <= now;
      if (execution.workerToken && execution.workerToken !== token && !expired) return;
      execution.workerToken = token;
      execution.leaseUntil = new Date(now + leaseMs).toISOString();
      claimed = true;
    });
    return claimed;
  }

  async renewLease(id: string, token: string, leaseMs: number): Promise<boolean> {
    let renewed = false;
    this.db.mutate((s) => {
      const execution = s.executions.find((item) => item.id === id);
      if (
        !execution ||
        execution.workerToken !== token
      ) return;
      execution.leaseUntil = new Date(Date.now() + leaseMs).toISOString();
      renewed = true;
    });
    return renewed;
  }

  async releaseLease(id: string, token: string): Promise<void> {
    this.db.mutate((s) => {
      const execution = s.executions.find((item) => item.id === id);
      if (!execution || execution.workerToken !== token) return;
      delete execution.workerToken;
      delete execution.leaseUntil;
    });
  }

  async saveCheckpoint(
    id: string,
    checkpoint: ExecutionCheckpoint,
  ): Promise<void> {
    this.db.mutate((s) => {
      const e = s.executions.find((x) => x.id === id);
      if (e) e.checkpoint = structuredClone(checkpoint);
    });
  }

  async getResumeState(id: string): Promise<ExecutionResumeState | null> {
    const e = this.db.get().executions.find((item) => item.id === id);
    if (!e || e.graphSnapshot === undefined) return null;
    return {
      graphSnapshot: structuredClone(e.graphSnapshot),
      checkpoint: e.checkpoint ? structuredClone(e.checkpoint) : undefined,
    };
  }

  async beginEffect(
    invocation: ExecutionEffectInvocation,
  ): Promise<EffectJournalBeginResult> {
    const stored = this.find(invocation.metadata.executionId);
    const current = stored?.effects?.find((effect) => effect.id === invocation.id);
    if (current) {
      assertEffectIdentity(current, invocation);
      if (current.status === "completed") {
        return { kind: "replay", result: structuredClone(current.result) };
      }
    }
    let outcome: EffectJournalBeginResult | undefined;
    this.db.mutate((snapshot) => {
      const execution = snapshot.executions.find(
        (item) => item.id === invocation.metadata.executionId,
      );
      if (!execution) throw new Error("副作用所属执行不存在");
      const effects = execution.effects ??= [];
      const existing = effects.find((effect) => effect.id === invocation.id);
      if (!existing) {
        effects.push(pendingEffect(invocation));
        outcome = { kind: "execute" };
        return;
      }
      assertEffectIdentity(existing, invocation);
      existing.status = "pending";
      existing.metadata = structuredClone(invocation.metadata);
      delete existing.error;
      existing.updatedAt = new Date().toISOString();
      outcome = { kind: "execute" };
    });
    if (!outcome) throw new Error("副作用 journal 写入失败");
    return outcome;
  }

  async completeEffect(
    invocation: ExecutionEffectInvocation,
    result: unknown,
  ): Promise<void> {
    this.db.mutate((snapshot) => {
      const execution = snapshot.executions.find(
        (item) => item.id === invocation.metadata.executionId,
      );
      const existing = execution?.effects?.find(
        (effect) => effect.id === invocation.id,
      );
      if (!existing) throw new Error("副作用 journal 记录不存在");
      assertEffectIdentity(existing, invocation);
      existing.status = "completed";
      existing.result = structuredClone(result);
      delete existing.error;
      existing.updatedAt = new Date().toISOString();
    });
  }

  async failEffect(
    invocation: ExecutionEffectInvocation,
    error: string,
  ): Promise<void> {
    this.db.mutate((snapshot) => {
      const execution = snapshot.executions.find(
        (item) => item.id === invocation.metadata.executionId,
      );
      const existing = execution?.effects?.find(
        (effect) => effect.id === invocation.id,
      );
      if (!existing) throw new Error("副作用 journal 记录不存在");
      assertEffectIdentity(existing, invocation);
      if (existing.status === "completed") return;
      existing.status = "failed";
      existing.error = normalizeEffectError(error);
      existing.updatedAt = new Date().toISOString();
    });
  }

  async listEffects(executionId: string): Promise<ExecutionEffectRecord[]> {
    return structuredClone(this.find(executionId)?.effects ?? []);
  }

  async findById(id: string): Promise<ExecutionDetail | null> {
    const e = this.find(id);
    if (!e) return null;
    const copy = structuredClone(e);
    delete copy.graphSnapshot;
    delete copy.checkpoint;
    delete copy.controlMode;
    delete copy.controlRequestedAt;
    delete copy.workerToken;
    delete copy.leaseUntil;
    delete copy.effects;
    return copy;
  }

  async getLogs(id: string): Promise<ExecutionLogEntry[]> {
    return [...(this.find(id)?.logs ?? [])];
  }

  async listByWorkflow(workflowId: string): Promise<ExecutionSummary[]> {
    return this.db
      .get()
      .executions.filter((e) => e.workflowId === workflowId)
      .map(toSummary);
  }

  async listByOwner(ownerId: string): Promise<ExecutionSummary[]> {
    return this.db
      .get()
      .executions.filter((e) => e.ownerId === ownerId)
      .map(toSummary);
  }
}
