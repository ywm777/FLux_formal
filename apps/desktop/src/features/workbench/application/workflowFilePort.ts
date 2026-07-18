import type { WorkflowRecord } from "@flux/shared";

export interface ImportedWorkflowDocument {
  title: string;
  tags: string[];
  graph: unknown;
}

/** Portable workflow-file capability consumed by workbench use cases. */
export interface WorkflowFilePort {
  parse(source: string): ImportedWorkflowDocument;
  download(workflow: WorkflowRecord): void;
}
