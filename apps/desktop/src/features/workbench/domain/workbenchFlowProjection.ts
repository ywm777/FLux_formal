import {
  EXECUTION_STATUS,
  type ExecutionStatus,
  type WorkflowSummary,
} from "@flux/shared";

export type WorkbenchFlowState =
  | "attention"
  | "running"
  | "scheduled"
  | "completed"
  | "ready"
  | "draft"
  | "inactive";

export type WorkbenchFlowFilter =
  | "all"
  | "attention"
  | "running"
  | "scheduled"
  | "completed";

export interface WorkbenchRuntimeSnapshot {
  status: ExecutionStatus | "waiting" | "invalid" | "disabled";
  triggerCount: number;
  timezone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  error: string | null;
}

export interface WorkbenchFlowItem {
  workflow: WorkflowSummary;
  state: WorkbenchFlowState;
  statusLabel: string;
  statusDetail: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  timezone: string | null;
  triggerCount: number;
  error: string | null;
}

export interface WorkbenchFlowOverview {
  total: number;
  attention: number;
  running: number;
  scheduled: number;
  completed: number;
}

export interface WorkbenchFlowProjection {
  items: WorkbenchFlowItem[];
  overview: WorkbenchFlowOverview;
}

const STATE_PRIORITY: Record<WorkbenchFlowState, number> = {
  attention: 0,
  running: 1,
  scheduled: 2,
  completed: 3,
  ready: 4,
  draft: 5,
  inactive: 6,
};

export function projectWorkbenchFlows(
  workflows: WorkflowSummary[],
  runtimes: Record<string, WorkbenchRuntimeSnapshot | undefined>,
): WorkbenchFlowProjection {
  const items = workflows
    .map((workflow) => projectFlow(workflow, runtimes[workflow.id]))
    .sort(
      (left, right) =>
        STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state] ||
        Number(right.workflow.isFavorite) - Number(left.workflow.isFavorite) ||
        right.workflow.updatedAt.localeCompare(left.workflow.updatedAt),
    );

  return {
    items,
    overview: {
      total: items.length,
      attention: items.filter((item) => item.state === "attention").length,
      running: items.filter((item) => item.state === "running").length,
      scheduled: items.filter((item) => item.state === "scheduled").length,
      completed: items.filter((item) => item.state === "completed").length,
    },
  };
}

export function matchesWorkbenchFlowFilter(
  item: WorkbenchFlowItem,
  filter: WorkbenchFlowFilter,
): boolean {
  return filter === "all" || item.state === filter;
}

function projectFlow(
  workflow: WorkflowSummary,
  runtime: WorkbenchRuntimeSnapshot | undefined,
): WorkbenchFlowItem {
  if (!runtime) {
    return baseItem(
      workflow,
      workflow.status === "published" ? "ready" : "draft",
      workflow.status === "published" ? "可运行" : "编辑中",
      workflow.status === "published" ? "未设置自动计划" : "继续完善流程编排",
    );
  }

  if (runtime.status === "invalid") {
    return runtimeItem(workflow, runtime, "attention", "配置异常", runtime.error ?? "计划设置需要修正");
  }
  if (runtime.status === EXECUTION_STATUS.FAILED) {
    return runtimeItem(workflow, runtime, "attention", "运行失败", runtime.error ?? "上次运行未完成");
  }
  if (runtime.status === EXECUTION_STATUS.PAUSED) {
    return runtimeItem(workflow, runtime, "attention", "等待处理", runtime.error ?? "流程正在等待人工确认");
  }
  if (runtime.status === EXECUTION_STATUS.RUNNING) {
    return runtimeItem(workflow, runtime, "running", "运行中", "正在处理流程节点");
  }
  if (runtime.status === EXECUTION_STATUS.SUCCESS) {
    return runtimeItem(workflow, runtime, "completed", "已完成", "上次运行成功完成");
  }
  if (runtime.status === "waiting" || runtime.status === EXECUTION_STATUS.IDLE) {
    return runtimeItem(workflow, runtime, "scheduled", "等待触发", `${runtime.triggerCount} 个自动触发器`);
  }
  if (runtime.status === "disabled") {
    return runtimeItem(workflow, runtime, "inactive", "计划已暂停", `${runtime.triggerCount} 个触发器已停用`);
  }
  if (runtime.status === EXECUTION_STATUS.CANCELLED) {
    return runtimeItem(workflow, runtime, "inactive", "已取消", "上次运行已取消");
  }

  return baseItem(workflow, "ready", "可运行", "等待下一步操作");
}

function baseItem(
  workflow: WorkflowSummary,
  state: WorkbenchFlowState,
  statusLabel: string,
  statusDetail: string,
): WorkbenchFlowItem {
  return {
    workflow,
    state,
    statusLabel,
    statusDetail,
    nextRunAt: null,
    lastRunAt: null,
    timezone: null,
    triggerCount: 0,
    error: null,
  };
}

function runtimeItem(
  workflow: WorkflowSummary,
  runtime: WorkbenchRuntimeSnapshot,
  state: WorkbenchFlowState,
  statusLabel: string,
  statusDetail: string,
): WorkbenchFlowItem {
  return {
    workflow,
    state,
    statusLabel,
    statusDetail,
    nextRunAt: runtime.nextRunAt,
    lastRunAt: runtime.lastRunAt,
    timezone: runtime.timezone,
    triggerCount: runtime.triggerCount,
    error: runtime.error,
  };
}
