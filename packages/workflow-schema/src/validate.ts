import { WorkflowGraphSchema, type WorkflowGraph } from "./schema.js";

export interface GraphIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/** 解析并标准化（应用默认值），失败时抛出 ZodError */
export function parseGraph(input: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(input);
}

/** 安全解析，返回 success 标志 */
export function safeParseGraph(input: unknown) {
  return WorkflowGraphSchema.safeParse(input);
}

/**
 * 结构性校验：检查悬空边、自环、重复节点 ID。
 * 注意：DAG 拓扑/环检测由执行引擎在编译阶段负责，此处只做画布期轻校验。
 */
export function validateGraph(graph: WorkflowGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        level: "error",
        message: `重复的节点 ID: ${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      issues.push({
        level: "error",
        message: `连线自环: ${edge.id}`,
        edgeId: edge.id,
      });
    }
    if (!nodeIds.has(edge.source)) {
      issues.push({
        level: "error",
        message: `连线 ${edge.id} 的起点节点不存在: ${edge.source}`,
        edgeId: edge.id,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        level: "error",
        message: `连线 ${edge.id} 的终点节点不存在: ${edge.target}`,
        edgeId: edge.id,
      });
    }
  }

  return issues;
}
