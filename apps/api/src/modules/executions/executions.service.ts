import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ExecutionDetail,
  ExecutionLogEntry,
  ExecutionNodeInputs,
  ExecutionSummary,
  WorkflowRecord,
} from "@flux/shared";
import { EXECUTION_STATUS, WORKFLOW_STATUS } from "@flux/shared";
import { NodeRegistry, builtinNodes } from "@flux/node-sdk";
import { safeParseGraph, validateGraph } from "@flux/workflow-schema";
import {
  ExecutionInputRequiredError,
  prepareWorkflowForExecution,
} from "@flux/workflow-runtime";
import { ExecutionsRepository } from "../../database/repositories/executions.repository";
import { WorkflowsRepository } from "../../database/repositories/workflows.repository";
import { CancelRegistry, type CancelMode } from "./cancel-registry.service";
import { compileExecutionOrder } from "./engine";
import { ExecutionQueue } from "./execution-queue";

type ApprovalDecision = "approved" | "rejected";

@Injectable()
export class ExecutionsService {
  private readonly registry = new NodeRegistry();

  constructor(
    private readonly executions: ExecutionsRepository,
    private readonly workflows: WorkflowsRepository,
    private readonly queue: ExecutionQueue,
    private readonly cancels: CancelRegistry,
  ) {
    this.registry.registerAll(builtinNodes);
  }

  /** 创建执行记录并入队（不阻塞，立即返回 executionId） */
  async start(
    ownerId: string,
    workflowId: string,
    inputs: ExecutionNodeInputs = {},
  ): Promise<{ executionId: string; status: string }> {
    const workflow = await this.workflows.findById(workflowId);
    if (!workflow || workflow.ownerId !== ownerId) {
      throw new NotFoundException("工作流不存在");
    }
    if (workflow.status !== WORKFLOW_STATUS.PUBLISHED) {
      throw new ConflictException("工作流尚未发布");
    }

    return this.createExecutionFromWorkflow(workflow, inputs);
  }

  /** 草稿测试运行：校验所有权和图结构，但不要求发布状态 */
  async startDraft(
    ownerId: string,
    workflowId: string,
    inputs: ExecutionNodeInputs = {},
  ): Promise<{ executionId: string; status: string }> {
    const workflow = await this.workflows.findById(workflowId);
    if (!workflow || workflow.ownerId !== ownerId) {
      throw new NotFoundException("工作流不存在");
    }

    return this.createExecutionFromWorkflow(workflow, inputs);
  }

  private async createExecutionFromWorkflow(
    workflow: WorkflowRecord,
    inputs: ExecutionNodeInputs,
  ): Promise<{ executionId: string; status: string }> {
    const parsed = safeParseGraph(workflow.graph);
    if (!parsed.success) {
      throw new BadRequestException("工作流图格式无效");
    }
    const issues = validateGraph(parsed.data).filter((issue) => issue.level === "error");
    if (issues.length > 0) {
      throw new BadRequestException({
        message: "工作流图结构无效",
        issues: issues.map((issue) => issue.message),
      });
    }
    const unsupportedNodeTypes = [...new Set(
      parsed.data.nodes
        .filter((node) => !this.registry.resolve(node.type))
        .map((node) => node.type),
    )];
    if (unsupportedNodeTypes.length > 0) {
      throw new BadRequestException({
        message: "工作流包含云端未安装的节点能力",
        code: "UNSUPPORTED_CLOUD_NODE",
        nodeTypes: unsupportedNodeTypes,
      });
    }
    try {
      compileExecutionOrder(parsed.data);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    let executionGraph;
    try {
      executionGraph = prepareWorkflowForExecution(parsed.data, this.registry, inputs);
    } catch (error) {
      if (error instanceof ExecutionInputRequiredError) {
        throw new BadRequestException({
          message: error.message,
          code: error.code,
          missing: error.missing,
        });
      }
      throw error;
    }
    const record = await this.executions.create({
      workflowId: workflow.id,
      ownerId: workflow.ownerId,
      graphSnapshot: executionGraph,
    });
    try {
      await this.queue.add({
        executionId: record.id,
        workflowId: workflow.id,
        ownerId: workflow.ownerId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "执行任务入队失败";
      try {
        await this.executions.appendLog(record.id, {
          nodeId: "",
          level: "error",
          message: `执行任务未能入队：${message}`,
          at: new Date().toISOString(),
        });
      } catch {
        // Preserve the original queue failure; finalize is still attempted below.
      }
      try {
        await this.executions.finalize(
          record.id,
          EXECUTION_STATUS.FAILED,
          message,
        );
      } catch {
        // The queue error remains the actionable failure returned to the caller.
      }
      throw error;
    }
    return { executionId: record.id, status: record.status };
  }

  private async getOwned(
    ownerId: string,
    executionId: string,
  ): Promise<ExecutionDetail> {
    const record = await this.executions.findById(executionId);
    if (!record) throw new NotFoundException("执行记录不存在");
    if (record.ownerId !== ownerId) throw new ForbiddenException("无权访问");
    return record;
  }

  get(ownerId: string, executionId: string): Promise<ExecutionDetail> {
    return this.getOwned(ownerId, executionId);
  }

  async getLogs(
    ownerId: string,
    executionId: string,
  ): Promise<ExecutionLogEntry[]> {
    await this.getOwned(ownerId, executionId);
    return this.executions.getLogs(executionId);
  }

  listByOwner(ownerId: string): Promise<ExecutionSummary[]> {
    return this.executions.listByOwner(ownerId);
  }

  async cancel(
    ownerId: string,
    executionId: string,
    mode: CancelMode = "terminate",
  ): Promise<{ executionId: string; cancelled: boolean }> {
    if (mode !== "terminate" && mode !== "pause") {
      throw new BadRequestException("取消模式只允许 terminate 或 pause");
    }
    await this.getOwned(ownerId, executionId);
    const cancelled = await this.executions.requestControl(executionId, mode);
    if (cancelled) this.cancels.cancel(executionId, mode);
    return { executionId, cancelled };
  }

  async resume(
    ownerId: string,
    executionId: string,
  ): Promise<{ executionId: string; status: string }> {
    const execution = await this.getOwned(ownerId, executionId);
    if (execution.status !== EXECUTION_STATUS.PAUSED) {
      throw new ConflictException("当前执行不在可恢复的暂停状态");
    }
    const resumeState = await this.executions.getResumeState(executionId);
    if (!resumeState?.checkpoint) {
      throw new ConflictException("该执行缺少 checkpoint，无法安全恢复");
    }
    if (resumeState.checkpoint.pausedNodeId) {
      throw new ConflictException("该执行正在等待人工确认，请提交确认结果");
    }
    const claimed = await this.executions.transitionStatus(
      executionId,
      EXECUTION_STATUS.PAUSED,
      EXECUTION_STATUS.RUNNING,
    );
    if (!claimed) {
      throw new ConflictException("该执行已被其他请求恢复，请刷新状态");
    }
    try {
      await this.executions.clearControlRequest(executionId);
      await this.executions.appendLog(executionId, {
        nodeId: "",
        level: "info",
        message: "执行已恢复，继续运行未完成节点",
        at: new Date().toISOString(),
      });
      await this.queue.add({
        executionId,
        workflowId: execution.workflowId,
        ownerId,
        resumeId: randomUUID(),
      });
    } catch (error) {
      await this.executions.transitionStatus(
        executionId,
        EXECUTION_STATUS.RUNNING,
        EXECUTION_STATUS.PAUSED,
      );
      throw error;
    }
    return { executionId, status: EXECUTION_STATUS.RUNNING };
  }

  async approve(
    ownerId: string,
    executionId: string,
    input: {
      nodeId: string;
      decision: ApprovalDecision;
      reviewer?: string;
      note?: string;
    },
  ): Promise<{ executionId: string; status: string }> {
    const execution = await this.getOwned(ownerId, executionId);
    if (execution.status !== EXECUTION_STATUS.PAUSED) {
      throw new ConflictException("当前执行不在人工确认状态");
    }

    const resumeState = await this.executions.getResumeState(executionId);
    if (!resumeState) {
      throw new ConflictException(
        "该执行缺少创建时的流程快照，无法安全恢复，请重新运行工作流",
      );
    }
    const parsed = safeParseGraph(resumeState.graphSnapshot);
    if (!parsed.success) throw new BadRequestException("执行快照格式无效");
    const node = parsed.data.nodes.find((item) => item.id === input.nodeId);
    if (!node || node.type !== "flux.business.humanReview") {
      throw new BadRequestException("未找到可确认的人工节点");
    }
    if (resumeState.checkpoint?.pausedNodeId !== input.nodeId) {
      throw new BadRequestException("该节点不是当前等待确认的人工节点");
    }

    const claimed = await this.executions.transitionStatus(
      executionId,
      EXECUTION_STATUS.PAUSED,
      EXECUTION_STATUS.RUNNING,
    );
    if (!claimed) {
      throw new ConflictException("该人工确认已被处理，请刷新执行状态");
    }

    try {
      await this.executions.appendLog(executionId, {
        nodeId: input.nodeId,
        level: "info",
        message:
          input.decision === "approved"
            ? "人工确认通过，继续执行后续步骤"
            : "人工确认退回，跳过仅接受通过结果的后续步骤",
        at: new Date().toISOString(),
      });
      await this.queue.add({
        executionId,
        workflowId: execution.workflowId,
        ownerId,
        approval: {
          nodeId: input.nodeId,
          decision: input.decision,
          reviewer: input.reviewer,
          note: input.note,
        },
      });
    } catch (error) {
      await this.executions.transitionStatus(
        executionId,
        EXECUTION_STATUS.RUNNING,
        EXECUTION_STATUS.PAUSED,
      );
      throw error;
    }

    return { executionId, status: EXECUTION_STATUS.RUNNING };
  }
}
