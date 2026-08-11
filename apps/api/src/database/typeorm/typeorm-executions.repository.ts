import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import {
  EXECUTION_STATUS,
  type ExecutionDetail,
  type ExecutionLogEntry,
  type ExecutionStatus,
  type ExecutionSummary,
  type NodeRunRecord,
} from "@flux/shared";
import { ExecutionEntity } from "../entities/execution.entity";
import { ExecutionLogEntity } from "../entities/execution-log.entity";
import { ExecutionNodeRunEntity } from "../entities/execution-node-run.entity";
import { ExecutionEffectEntity } from "../entities/execution-effect.entity";
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
} from "../repositories/execution-effect";

@Injectable()
export class TypeOrmExecutionsRepository extends ExecutionsRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  private get executions() {
    return this.dataSource.getRepository(ExecutionEntity);
  }
  private get runs() {
    return this.dataSource.getRepository(ExecutionNodeRunEntity);
  }
  private get logs() {
    return this.dataSource.getRepository(ExecutionLogEntity);
  }
  private get effects() {
    return this.dataSource.getRepository(ExecutionEffectEntity);
  }

  private toEffectRecord(entity: ExecutionEffectEntity): ExecutionEffectRecord {
    return {
      id: entity.id,
      bindingId: entity.bindingId,
      action: entity.action,
      metadata: {
        executionId: entity.executionId,
        nodeId: entity.nodeId,
        attempt: entity.attempt,
        invocationIndex: entity.invocationIndex,
        idempotencyKey: entity.id,
      },
      status: entity.status,
      ...(entity.result !== undefined && entity.result !== null
        ? { result: structuredClone(entity.result) }
        : entity.status === "completed"
          ? { result: entity.result }
          : {}),
      ...(entity.error ? { error: entity.error } : {}),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  async create(input: CreateExecutionInput): Promise<ExecutionDetail> {
    const entity = this.executions.create({
      id: randomUUID(),
      workflowId: input.workflowId,
      ownerId: input.ownerId,
      status: EXECUTION_STATUS.RUNNING,
      order: [],
      graphSnapshot: structuredClone(input.graphSnapshot),
    });
    await this.executions.save(entity);
    return {
      id: entity.id,
      workflowId: entity.workflowId,
      ownerId: entity.ownerId,
      status: entity.status,
      order: [],
      runs: [],
      logs: [],
      startedAt: entity.startedAt.toISOString(),
    };
  }

  async setOrder(id: string, order: string[]): Promise<void> {
    await this.executions.update({ id }, { order });
  }

  async appendLog(id: string, entry: ExecutionLogEntry): Promise<void> {
    await this.logs.insert({
      executionId: id,
      nodeId: entry.nodeId,
      level: entry.level,
      message: entry.message,
      at: new Date(entry.at),
    });
  }

  async upsertNodeRun(id: string, run: NodeRunRecord): Promise<void> {
    const existing = await this.runs.findOne({
      where: { executionId: id, nodeId: run.nodeId },
    });
    if (existing) {
      existing.status = run.status;
      existing.outputs = run.outputs ?? null;
      existing.error = run.error ?? null;
      await this.runs.save(existing);
    } else {
      const row = this.runs.create({
        id: randomUUID(),
        executionId: id,
        nodeId: run.nodeId,
        type: run.type,
        status: run.status,
        outputs: run.outputs ?? null,
        error: run.error ?? null,
      });
      await this.runs.save(row);
    }
  }

  async finalize(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void> {
    await this.executions.update(
      { id },
      { status, finishedAt: new Date(), error: error ?? null },
    );
  }

  async markStatus(
    id: string,
    status: ExecutionStatus,
    error?: string,
  ): Promise<void> {
    await this.executions.update(
      { id },
      {
        status,
        finishedAt:
          status === EXECUTION_STATUS.RUNNING || status === EXECUTION_STATUS.PAUSED
            ? null
            : new Date(),
        error: error ?? null,
      },
    );
  }

  async transitionStatus(
    id: string,
    from: ExecutionStatus,
    to: ExecutionStatus,
  ): Promise<boolean> {
    const result = await this.executions.update(
      { id, status: from },
      {
        status: to,
        finishedAt:
          to === EXECUTION_STATUS.RUNNING || to === EXECUTION_STATUS.PAUSED
            ? null
            : new Date(),
        error: null,
      },
    );
    return result.affected === 1;
  }

  async requestControl(
    id: string,
    mode: ExecutionControlMode,
  ): Promise<boolean> {
    const result = await this.executions.update(
      { id, status: EXECUTION_STATUS.RUNNING },
      { controlMode: mode, controlRequestedAt: new Date() },
    );
    return result.affected === 1;
  }

  async getControlRequest(id: string): Promise<ExecutionControlRequest | null> {
    const entity = await this.executions.findOne({ where: { id } });
    return entity?.controlMode && entity.controlRequestedAt
      ? {
          mode: entity.controlMode,
          requestedAt: entity.controlRequestedAt.toISOString(),
        }
      : null;
  }

  async clearControlRequest(id: string): Promise<void> {
    await this.executions.update(
      { id },
      { controlMode: null, controlRequestedAt: null },
    );
  }

  async claimLease(id: string, token: string, leaseMs: number): Promise<boolean> {
    const result = await this.executions
      .createQueryBuilder()
      .update(ExecutionEntity)
      .set({ workerToken: token, leaseUntil: new Date(Date.now() + leaseMs) })
      .where('"id" = :id', { id })
      .andWhere('"status" = :status', { status: EXECUTION_STATUS.RUNNING })
      .andWhere(
        '("worker_token" IS NULL OR "lease_until" IS NULL OR "lease_until" <= NOW() OR "worker_token" = :token)',
        { token },
      )
      .execute();
    return result.affected === 1;
  }

  async renewLease(id: string, token: string, leaseMs: number): Promise<boolean> {
    const result = await this.executions.update(
      { id, workerToken: token },
      { leaseUntil: new Date(Date.now() + leaseMs) },
    );
    return result.affected === 1;
  }

  async releaseLease(id: string, token: string): Promise<void> {
    await this.executions.update(
      { id, workerToken: token },
      { workerToken: null, leaseUntil: null },
    );
  }

  async saveCheckpoint(
    id: string,
    checkpoint: ExecutionCheckpoint,
  ): Promise<void> {
    // Partial update is intentional: an entity read/save cycle can overwrite a
    // concurrently finalized status with the stale status read before the write.
    await this.executions.update(
      { id },
      // TypeORM's deep-partial type cannot represent arbitrary JSON records,
      // although the jsonb column accepts the complete checkpoint value.
      { checkpoint: structuredClone(checkpoint) as never },
    );
  }

  async getResumeState(id: string): Promise<ExecutionResumeState | null> {
    const entity = await this.executions.findOne({ where: { id } });
    if (!entity || entity.graphSnapshot == null) return null;
    return {
      graphSnapshot: structuredClone(entity.graphSnapshot),
      checkpoint: entity.checkpoint
        ? structuredClone(entity.checkpoint)
        : undefined,
    };
  }

  async beginEffect(
    invocation: ExecutionEffectInvocation,
  ): Promise<EffectJournalBeginResult> {
    await this.effects
      .createQueryBuilder()
      .insert()
      .into(ExecutionEffectEntity)
      .values({
        id: invocation.id,
        executionId: invocation.metadata.executionId,
        nodeId: invocation.metadata.nodeId,
        bindingId: invocation.bindingId,
        action: invocation.action,
        attempt: invocation.metadata.attempt,
        invocationIndex: invocation.metadata.invocationIndex,
        status: "pending",
      })
      .orIgnore()
      .execute();

    const existing = await this.effects.findOne({ where: { id: invocation.id } });
    if (!existing) throw new Error("副作用 journal 写入失败");
    const record = this.toEffectRecord(existing);
    assertEffectIdentity(record, invocation);
    if (existing.status === "completed") {
      return { kind: "replay", result: structuredClone(existing.result) };
    }
    if (existing.status === "failed") {
      await this.effects
        .createQueryBuilder()
        .update(ExecutionEffectEntity)
        .set({
          status: "pending",
          attempt: invocation.metadata.attempt,
          error: null,
        })
        .where('"id" = :id', { id: invocation.id })
        .andWhere('"execution_id" = :executionId', {
          executionId: invocation.metadata.executionId,
        })
        .andWhere('"status" = :failed', { failed: "failed" })
        .execute();
    }
    return { kind: "execute" };
  }

  async completeEffect(
    invocation: ExecutionEffectInvocation,
    result: unknown,
  ): Promise<void> {
    const existing = await this.effects.findOne({ where: { id: invocation.id } });
    if (!existing) throw new Error("副作用 journal 记录不存在");
    assertEffectIdentity(this.toEffectRecord(existing), invocation);
    await this.effects.update(
      { id: invocation.id, executionId: invocation.metadata.executionId },
      { status: "completed", result: structuredClone(result) as never, error: null },
    );
  }

  async failEffect(
    invocation: ExecutionEffectInvocation,
    error: string,
  ): Promise<void> {
    const existing = await this.effects.findOne({ where: { id: invocation.id } });
    if (!existing) throw new Error("副作用 journal 记录不存在");
    assertEffectIdentity(this.toEffectRecord(existing), invocation);
    await this.effects
      .createQueryBuilder()
      .update(ExecutionEffectEntity)
      .set({ status: "failed", error: normalizeEffectError(error) })
      .where('"id" = :id', { id: invocation.id })
      .andWhere('"execution_id" = :executionId', {
        executionId: invocation.metadata.executionId,
      })
      .andWhere('"status" <> :completed', { completed: "completed" })
      .execute();
  }

  async listEffects(executionId: string): Promise<ExecutionEffectRecord[]> {
    const rows = await this.effects.find({
      where: { executionId },
      order: { createdAt: "ASC" },
    });
    return rows.map((row) => this.toEffectRecord(row));
  }

  async findById(id: string): Promise<ExecutionDetail | null> {
    const entity = await this.executions.findOne({ where: { id } });
    if (!entity) return null;
    const [runRows, logRows] = await Promise.all([
      this.runs.find({ where: { executionId: id } }),
      this.logs.find({ where: { executionId: id }, order: { seq: "ASC" } }),
    ]);
    return {
      id: entity.id,
      workflowId: entity.workflowId,
      ownerId: entity.ownerId,
      status: entity.status,
      order: entity.order ?? [],
      error: entity.error ?? undefined,
      startedAt: entity.startedAt.toISOString(),
      finishedAt: entity.finishedAt?.toISOString(),
      runs: runRows.map((r) => ({
        nodeId: r.nodeId,
        type: r.type,
        status: r.status,
        outputs: r.outputs ?? undefined,
        error: r.error ?? undefined,
      })),
      logs: logRows.map((l) => ({
        nodeId: l.nodeId,
        level: l.level,
        message: l.message,
        at: l.at.toISOString(),
      })),
    };
  }

  async getLogs(id: string): Promise<ExecutionLogEntry[]> {
    const rows = await this.logs.find({
      where: { executionId: id },
      order: { seq: "ASC" },
    });
    return rows.map((l) => ({
      nodeId: l.nodeId,
      level: l.level,
      message: l.message,
      at: l.at.toISOString(),
    }));
  }

  async listByWorkflow(workflowId: string): Promise<ExecutionSummary[]> {
    const rows = await this.executions.find({
      where: { workflowId },
      order: { startedAt: "DESC" },
    });
    return rows.map((e) => ({
      id: e.id,
      workflowId: e.workflowId,
      status: e.status,
      startedAt: e.startedAt.toISOString(),
      finishedAt: e.finishedAt?.toISOString(),
    }));
  }

  async listByOwner(ownerId: string): Promise<ExecutionSummary[]> {
    const rows = await this.executions.find({
      where: { ownerId },
      order: { startedAt: "DESC" },
    });
    return rows.map((e) => ({
      id: e.id,
      workflowId: e.workflowId,
      status: e.status,
      startedAt: e.startedAt.toISOString(),
      finishedAt: e.finishedAt?.toISOString(),
    }));
  }
}
