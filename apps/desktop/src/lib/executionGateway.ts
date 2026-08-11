import type { ExecutionDetail, ExecutionNodeInputs } from "@flux/shared";
import {
  approveExecutionAndContinue as approveCloudExecutionAndContinue,
  runDraftExecution as runCloudDraftExecution,
  type ExecutionResponse,
} from "./api.js";
import {
  approveLocalExecutionAndContinue,
  runLocalDraftExecution,
} from "./localExecution.js";
import { useWorkspaceStore } from "../store/workspaceStore.js";

export type { ExecutionResponse } from "./api.js";

export function runDraftExecution(
  workflowId: string,
  inputs: ExecutionNodeInputs = {},
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  return useWorkspaceStore.getState().kind === "local"
    ? runLocalDraftExecution(workflowId, inputs, onProgress)
    : runCloudDraftExecution(workflowId, inputs, onProgress);
}

export function approveExecutionAndContinue(
  executionId: string,
  input: {
    nodeId: string;
    decision: "approved" | "rejected";
    reviewer?: string;
    note?: string;
  },
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  return executionId.startsWith("local_exec_")
    ? approveLocalExecutionAndContinue(executionId, input, onProgress)
    : approveCloudExecutionAndContinue(executionId, input, onProgress);
}
