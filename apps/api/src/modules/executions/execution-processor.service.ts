import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { NodeRegistry, builtinNodes } from "@flux/node-sdk";
import { EXECUTION_STATUS, NODE_RUN_STATUS } from "@flux/shared";
import { parseGraph } from "@flux/workflow-schema";
import { ExecutionsRepository } from "../../database/repositories/executions.repository";
import { CancelRegistry } from "./cancel-registry.service";
import {
  compileExecutionOrder,
  LatestAsyncWriter,
  runWorkflow,
  type ExecutionCheckpoint,
} from "./engine";
import { createExecutionEffectJournal } from "./execution-effect-journal";

export interface ExecutionJob {
  executionId: string;
  workflowId: string;
  ownerId: string;
  /** Legacy fallback for jobs queued before execution snapshots were persisted. */
  graph?: unknown;
  /** Unique phase identifier for a user-requested generic resume. */
  resumeId?: string;
  approval?: {
    nodeId: string;
    decision: "approved" | "rejected";
    reviewer?: string;
    note?: string;
  };
}

class ExecutionLeaseLostError extends Error {
  constructor() {
    super("执行 worker 已失去租约");
    this.name = "ExecutionLeaseLostError";
  }
}

/** 队列 worker 的实际处理逻辑：运行引擎并增量持久化结果 */
@Injectable()
export class ExecutionProcessor {
  private readonly logger = new Logger(ExecutionProcessor.name);
  private readonly registry = new NodeRegistry();

  constructor(
    private readonly executions: ExecutionsRepository,
    private readonly cancels: CancelRegistry,
  ) {
    this.registry.registerAll(builtinNodes);
  }

  private controlPollMs(): number {
    const raw = Number(process.env.EXEC_CONTROL_POLL_MS ?? 250);
    if (!Number.isFinite(raw)) return 250;
    return Math.max(50, Math.min(5_000, Math.trunc(raw)));
  }

  private leaseMs(): number {
    const raw = Number(process.env.EXEC_WORKER_LEASE_MS ?? 30_000);
    if (!Number.isFinite(raw)) return 30_000;
    return Math.max(1_000, Math.min(300_000, Math.trunc(raw)));
  }

  private maintainLease(
    executionId: string,
    token: string,
    leaseMs: number,
  ): { lost: () => boolean; stop: () => Promise<void> } {
    let stopped = false;
    let leaseLost = false;
    let active: Promise<void> | undefined;
    const renew = () => {
      if (stopped || active) return;
      active = this.executions.renewLease(executionId, token, leaseMs)
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true;
            this.cancels.cancel(executionId, "terminate");
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`续租执行 ${executionId} 失败：${message}`);
        })
        .finally(() => {
          active = undefined;
        });
    };
    const timer = setInterval(renew, Math.max(250, Math.trunc(leaseMs / 3)));
    timer.unref?.();
    return {
      lost: () => leaseLost,
      async stop() {
        stopped = true;
        clearInterval(timer);
        await active;
      },
    };
  }

  private observeControl(executionId: string): {
    poll: () => Promise<void>;
    stop: () => Promise<void>;
  } {
    let stopped = false;
    let active: Promise<void> | undefined;
    const poll = (): Promise<void> => {
      if (stopped) return Promise.resolve();
      if (active) return active;
      active = this.executions.getControlRequest(executionId)
        .then((request) => {
          if (request) this.cancels.cancel(executionId, request.mode);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`读取执行 ${executionId} 控制请求失败：${message}`);
        })
        .finally(() => {
          active = undefined;
        });
      return active;
    };
    const timer = setInterval(() => {
      void poll();
    }, this.controlPollMs());
    timer.unref?.();
    return {
      poll,
      async stop() {
        stopped = true;
        clearInterval(timer);
        await active;
      },
    };
  }

  async process(job: ExecutionJob): Promise<void> {
    const { executionId } = job;
    const workerToken = randomUUID();
    const leaseMs = this.leaseMs();
    const claimed = await this.executions.claimLease(
      executionId,
      workerToken,
      leaseMs,
    );
    if (!claimed) {
      this.logger.warn(`跳过执行 ${executionId}：已由其他 worker 领取或不再运行`);
      return;
    }
    const controller = this.cancels.register(executionId);
    const controlObserver = this.observeControl(executionId);
    const leaseObserver = this.maintainLease(executionId, workerToken, leaseMs);
    try {
      await controlObserver.poll();
      const resumeState = await this.executions.getResumeState(executionId);
      const graphSource = resumeState?.graphSnapshot ?? job.graph;
      if (graphSource === undefined) {
        throw new Error(
          "执行缺少创建时的流程快照，无法安全运行；请重新创建执行",
        );
      }
      const graph = parseGraph(graphSource);
      if (job.approval) {
        if (resumeState?.checkpoint?.pausedNodeId !== job.approval.nodeId) {
          throw new Error("人工确认恢复点与执行 checkpoint 不一致");
        }
        const approvalNode = graph.nodes.find(
          (node) => node.id === job.approval?.nodeId,
        );
        if (!approvalNode || approvalNode.type !== "flux.business.humanReview") {
          throw new Error("执行快照中不存在待确认的人工节点");
        }
        approvalNode.data = {
          ...approvalNode.data,
          decision: job.approval.decision,
          reviewer: job.approval.reviewer ?? approvalNode.data.reviewer,
          note: job.approval.note ?? approvalNode.data.note,
        };
      }
      try {
        const order = compileExecutionOrder(graph);
        await this.executions.setOrder(executionId, order);
        const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
        const completedNodeIds = new Set(
          resumeState?.checkpoint?.completedRuns.map((run) => run.nodeId) ?? [],
        );
        for (const nodeId of order) {
          if (completedNodeIds.has(nodeId)) continue;
          const node = nodeById.get(nodeId);
          if (!node) continue;
          await this.executions.upsertNodeRun(executionId, {
            nodeId,
            type: node.type,
            status: NODE_RUN_STATUS.PENDING,
          });
        }
      } catch {
        /* 含环：order 留空，运行阶段会报错 */
      }

      // 日志与节点状态共用一个写队列，保证 finalize 前所有增量写入已完成。
      // checkpoint 是可替换快照，只持久化写入期间出现的最新版本，避免长流程
      // 对同一份不断增长的快照逐个排队，造成二次方级写放大。
      let persistenceQueue = Promise.resolve();
      const enqueuePersistence = (operation: () => Promise<void>) => {
        persistenceQueue = persistenceQueue.then(operation);
      };
      const checkpointWriter = new LatestAsyncWriter<ExecutionCheckpoint>(
        (checkpoint) => this.executions.saveCheckpoint(executionId, checkpoint),
      );
      const result = await runWorkflow(graph, this.registry, {
        executionId,
        effectJournal: createExecutionEffectJournal(this.executions),
        signal: controller.signal,
        resumeFrom: resumeState?.checkpoint,
        onLog: (entry) => {
          if (leaseObserver.lost()) return;
          enqueuePersistence(() => this.executions.appendLog(executionId, entry));
        },
        onNodeRun: (run) => {
          if (leaseObserver.lost()) return;
          enqueuePersistence(() =>
            this.executions.upsertNodeRun(executionId, run));
        },
        onCheckpoint: (checkpoint) => {
          if (leaseObserver.lost()) return;
          checkpointWriter.push(checkpoint);
        },
      });
      if (!leaseObserver.lost()) checkpointWriter.push(result.checkpoint);
      const persistenceResults = await Promise.allSettled([
        persistenceQueue,
        checkpointWriter.flush(),
      ]);
      const persistenceFailure = persistenceResults.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
      );
      if (persistenceFailure) throw persistenceFailure.reason;
      if (leaseObserver.lost()) throw new ExecutionLeaseLostError();
      await controlObserver.poll();

      let status: (typeof EXECUTION_STATUS)[keyof typeof EXECUTION_STATUS];
      const controlMode = this.cancels.modeOf(executionId);
      if (controlMode === "pause") status = EXECUTION_STATUS.PAUSED;
      else if (controlMode === "terminate") status = EXECUTION_STATUS.CANCELLED;
      else if (result.status === "success") status = EXECUTION_STATUS.SUCCESS;
      else if (result.status === "failed") status = EXECUTION_STATUS.FAILED;
      else if (result.status === "paused") status = EXECUTION_STATUS.PAUSED;
      else
        status =
          this.cancels.modeOf(executionId) === "pause"
            ? EXECUTION_STATUS.PAUSED
            : EXECUTION_STATUS.CANCELLED;

      const failed = result.runs.find((r) => r.status === "failed");
      const executionError = status === EXECUTION_STATUS.FAILED ? failed?.error : undefined;
      if (status === EXECUTION_STATUS.PAUSED) {
        await this.executions.markStatus(executionId, status, executionError);
      } else {
        await this.executions.finalize(executionId, status, executionError);
      }
    } catch (err) {
      if (err instanceof ExecutionLeaseLostError || leaseObserver.lost()) {
        this.logger.warn(`停止执行 ${executionId}：worker 租约已转移`);
        return;
      }
      const message = err instanceof Error ? err.message : "执行失败";
      this.logger.error(`执行 ${executionId} 失败：${message}`);
      await this.executions.appendLog(executionId, {
        nodeId: "",
        level: "error",
        message,
        at: new Date().toISOString(),
      });
      await this.executions.finalize(
        executionId,
        EXECUTION_STATUS.FAILED,
        message,
      );
    } finally {
      await controlObserver.stop();
      await leaseObserver.stop();
      if (!leaseObserver.lost()) {
        try {
          await this.executions.clearControlRequest(executionId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`清理执行 ${executionId} 控制请求失败：${message}`);
        }
      }
      await this.executions.releaseLease(executionId, workerToken);
      this.cancels.release(executionId);
    }
  }
}
