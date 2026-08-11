import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  type ExecutionLogEntry,
  type ExecutionStatus,
  type NodeRunRecord,
  type NodeRunStatus,
} from "@flux/shared";
import { getNodeTypeName } from "./nodeDisplay.js";

const STATUS_LABEL: Record<ExecutionStatus | NodeRunStatus, string> = {
  [EXECUTION_STATUS.IDLE]: "未开始",
  [EXECUTION_STATUS.RUNNING]: "运行中",
  [EXECUTION_STATUS.SUCCESS]: "已完成",
  [EXECUTION_STATUS.FAILED]: "失败",
  [EXECUTION_STATUS.PAUSED]: "已暂停",
  [EXECUTION_STATUS.CANCELLED]: "已取消",
  [NODE_RUN_STATUS.PENDING]: "等待中",
  [NODE_RUN_STATUS.SKIPPED]: "已跳过",
};

export function getExecutionStatusLabel(
  status: ExecutionStatus | NodeRunStatus | string,
): string {
  return STATUS_LABEL[status as ExecutionStatus | NodeRunStatus] ?? status;
}

export function formatExecutionMessage(message: string | null | undefined): string {
  const raw = message?.trim();
  if (!raw) return "";

  if (
    /Failed to parse URL from undefined/i.test(raw) ||
    /\bHTTP\s+[A-Z]+\s+undefined\b/i.test(raw) ||
    /Invalid URL:\s*undefined/i.test(raw)
  ) {
    return "请求地址未配置，请先填写 URL。";
  }

  if (/Failed to parse URL from/i.test(raw) || /\bInvalid URL\b/i.test(raw)) {
    return "请求地址格式不正确，请检查 URL。";
  }

  if (/Failed to fetch|NetworkError/i.test(raw)) {
    return "请求失败，请检查网络或接口地址。";
  }

  if (/timeout|timed out/i.test(raw)) {
    return "请求超时，请稍后重试。";
  }

  return raw;
}

export function formatExecutionLogs(
  logs: ExecutionLogEntry[],
  runs: Pick<NodeRunRecord, "nodeId" | "type">[],
): ExecutionLogEntry[] {
  const nameByNodeId = new Map(
    runs.map((run) => [run.nodeId, getNodeTypeName(run.type)]),
  );

  return logs.map((log) => ({
    ...log,
    message: formatExecutionMessage(log.message),
    nodeId: nameByNodeId.get(log.nodeId) ?? "",
  }));
}
