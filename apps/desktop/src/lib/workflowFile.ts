import type { WorkflowRecord } from "@flux/shared";
import { safeParseGraph, type WorkflowGraph } from "@flux/workflow-schema";

export interface FluxWorkflowFile {
  format: "flux-workflow";
  version: 2;
  exportedAt: string;
  title: string;
  tags: string[];
  workflow: WorkflowGraph;
}

export interface ImportedFluxWorkflow {
  title: string;
  tags: string[];
  graph: WorkflowGraph;
}

export function createFluxWorkflowFile(
  record: Pick<WorkflowRecord, "title" | "tags" | "graph">,
): FluxWorkflowFile {
  const parsed = safeParseGraph(record.graph);
  if (!parsed.success) throw new Error("工作流图格式无效，无法导出");
  return {
    format: "flux-workflow",
    version: 2,
    exportedAt: new Date().toISOString(),
    title: record.title,
    tags: [...record.tags],
    workflow: parsed.data,
  };
}

export function parseFluxWorkflowFile(source: string): ImportedFluxWorkflow {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error("无法读取此 .flux 文件");
  }
  if (!data || typeof data !== "object") throw new Error("无效的 .flux 文件");
  const pack = data as Record<string, unknown>;
  const parsed = safeParseGraph(pack.workflow);
  if (!parsed.success) throw new Error(".flux 文件中的工作流图无效");
  const title = typeof pack.title === "string" && pack.title.trim()
    ? pack.title.trim()
    : parsed.data.meta.title;
  const tags = Array.isArray(pack.tags)
    ? pack.tags.filter((tag): tag is string => typeof tag === "string")
    : parsed.data.meta.tags;
  return { title, tags, graph: parsed.data };
}

export function downloadFluxWorkflow(
  record: Pick<WorkflowRecord, "title" | "tags" | "graph">,
): void {
  const pack = createFluxWorkflowFile(record);
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/vnd.flux.workflow+json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(record.title)}.flux`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return normalized || "Flux 工作流";
}
