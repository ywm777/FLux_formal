import {
  NodeRegistry,
  type NodeContext,
  type NodeDefinition,
} from "@flux/node-sdk";
import { NODE_RUN_STATUS, type NodeRunStatus } from "@flux/shared";
import type { WorkflowGraph, CanvasEdge } from "@flux/workflow-schema";

export interface ExecutionLogEntry {
  nodeId: string;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

export interface NodeRunResult {
  nodeId: string;
  type: string;
  status: NodeRunStatus;
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionResult {
  status: "success" | "failed";
  order: string[];
  runs: NodeRunResult[];
  logs: ExecutionLogEntry[];
}

const DEFAULT_OUT = "out";
const DEFAULT_IN = "in";

const sourceKey = (edge: CanvasEdge) =>
  `${edge.source}:${edge.sourcePort ?? DEFAULT_OUT}`;

/**
 * 将 WorkflowGraph 编译为执行顺序（Kahn 拓扑排序），并检测环。
 */
export function compileExecutionOrder(graph: WorkflowGraph): string[] {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!indegree.has(edge.target) || !adjacency.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== graph.nodes.length) {
    throw new Error("工作流存在环，无法编译为 DAG");
  }
  return order;
}

/**
 * 内存版 DAG 执行引擎。
 * - 按拓扑顺序执行；输入为上游已激活端口的输出聚合
 * - 条件分支：仅被选中的输出端口被"激活"，未选中分支的下游被跳过
 * - 支持取消（AbortSignal）
 */
export async function runWorkflow(
  graph: WorkflowGraph,
  registry: NodeRegistry,
  options: { signal?: AbortSignal } = {},
): Promise<ExecutionResult> {
  const order = compileExecutionOrder(graph);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const incomingByTarget = new Map<string, CanvasEdge[]>();
  for (const edge of graph.edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target, list);
  }

  const logs: ExecutionLogEntry[] = [];
  const runs: NodeRunResult[] = [];
  /** 已产出（激活）的输出端口：`${nodeId}:${port}` */
  const producedPorts = new Set<string>();
  /** 各节点各输出端口的值 */
  const portValues = new Map<string, unknown>();
  const signal = options.signal ?? new AbortController().signal;

  for (const nodeId of order) {
    if (signal.aborted) {
      runs.push({ nodeId, type: nodeById.get(nodeId)?.type ?? "?", status: NODE_RUN_STATUS.SKIPPED });
      continue;
    }
    const node = nodeById.get(nodeId)!;
    const incoming = incomingByTarget.get(nodeId) ?? [];

    // 判定可运行性：无入边=源节点；否则需至少一条入边来自已激活端口
    const activeEdges = incoming.filter((e) => producedPorts.has(sourceKey(e)));
    const isSource = incoming.length === 0;
    if (!isSource && activeEdges.length === 0) {
      runs.push({ nodeId, type: node.type, status: NODE_RUN_STATUS.SKIPPED });
      continue;
    }

    // 聚合输入：按目标端口收集上游值
    const inputsByPort: Record<string, unknown> = {};
    for (const edge of activeEdges) {
      inputsByPort[edge.targetPort ?? DEFAULT_IN] = portValues.get(sourceKey(edge));
    }
    // 便捷展开：仅默认 in 端口时直接传递其值
    const inputs =
      Object.keys(inputsByPort).length === 1 && DEFAULT_IN in inputsByPort
        ? (inputsByPort[DEFAULT_IN] as Record<string, unknown>) ?? {}
        : inputsByPort;

    const def: NodeDefinition | undefined = registry.resolve(node.type);
    if (!def) {
      const error = `未注册的节点类型: ${node.type}`;
      logs.push({ nodeId, level: "error", message: error, at: new Date().toISOString() });
      runs.push({ nodeId, type: node.type, status: NODE_RUN_STATUS.FAILED, error });
      return { status: "failed", order, runs, logs };
    }

    const ctx: NodeContext = {
      nodeId,
      config: node.data,
      inputs: inputs as Record<string, unknown>,
      signal,
      log: (level, message) =>
        logs.push({ nodeId, level, message, at: new Date().toISOString() }),
      invoke: async () => {
        throw new Error("载体调用未实现（需用户授权应用，见 PRD 4.4）");
      },
    };

    try {
      const result = await def.execute(ctx);
      for (const [port, value] of Object.entries(result.outputs)) {
        const key = `${nodeId}:${port}`;
        producedPorts.add(key);
        portValues.set(key, value);
      }
      runs.push({
        nodeId,
        type: node.type,
        status: NODE_RUN_STATUS.SUCCESS,
        outputs: result.outputs,
      });
    } catch (err) {
      const error = (err as Error).message;
      logs.push({ nodeId, level: "error", message: error, at: new Date().toISOString() });
      runs.push({ nodeId, type: node.type, status: NODE_RUN_STATUS.FAILED, error });
      return { status: "failed", order, runs, logs };
    }
  }

  return { status: "success", order, runs, logs };
}
