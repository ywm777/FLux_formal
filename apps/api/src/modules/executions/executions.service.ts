import { Injectable } from "@nestjs/common";
import { NodeRegistry, builtinNodes } from "@flux/node-sdk";
import { parseGraph } from "@flux/workflow-schema";
import { runWorkflow, type ExecutionResult } from "./engine";

interface ExecutionRecord extends ExecutionResult {
  executionId: string;
  workflowId: string;
  controller: AbortController;
}

@Injectable()
export class ExecutionsService {
  private readonly registry = new NodeRegistry();
  private readonly executions = new Map<string, ExecutionRecord>();

  constructor() {
    this.registry.registerAll(builtinNodes);
  }

  async start(workflowId: string, graphInput: unknown): Promise<ExecutionResult & { executionId: string }> {
    const graph = parseGraph(graphInput);
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    const result = await runWorkflow(graph, this.registry, {
      signal: controller.signal,
    });
    this.executions.set(executionId, {
      executionId,
      workflowId,
      controller,
      ...result,
    });
    return { executionId, ...result };
  }

  getLogs(executionId: string) {
    const record = this.executions.get(executionId);
    return record ? record.logs : [];
  }

  cancel(executionId: string) {
    const record = this.executions.get(executionId);
    record?.controller.abort();
    return { executionId, cancelled: Boolean(record) };
  }
}
