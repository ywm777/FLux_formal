import type { WorkflowGraph } from "@flux/workflow-schema";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";
const API = `${BASE_URL}/api`;

export interface NodeRunResult {
  nodeId: string;
  type: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionLogEntry {
  nodeId: string;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

export interface ExecutionResponse {
  executionId: string;
  status: "success" | "failed";
  order: string[];
  runs: NodeRunResult[];
  logs: ExecutionLogEntry[];
}

/** 运行一条工作流（POST /api/executions） */
export async function runExecution(
  workflowId: string,
  graph: WorkflowGraph,
): Promise<ExecutionResponse> {
  const res = await fetch(`${API}/executions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId, graph }),
  });
  if (!res.ok) throw new Error(`执行失败: HTTP ${res.status}`);
  return (await res.json()) as ExecutionResponse;
}
