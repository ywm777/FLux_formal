import {
  WorkflowGraphSchema,
  parseGraph,
  type WorkflowGraph,
} from "@flux/workflow-schema";

/** 序列化为持久化字符串 */
export function serializeGraph(graph: WorkflowGraph): string {
  return JSON.stringify(WorkflowGraphSchema.parse(graph));
}

/** 从字符串反序列化并标准化 */
export function deserializeGraph(raw: string): WorkflowGraph {
  return parseGraph(JSON.parse(raw));
}

/** 创建空白工作流图 */
export function createEmptyGraph(id: string, title = "未命名工作流"): WorkflowGraph {
  return parseGraph({
    id,
    version: 0,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    meta: { title, tags: [] },
  });
}
