/** 工作流发布状态 */
export const WORKFLOW_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;
export type WorkflowStatus =
  (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];

/** 执行状态机 */
export const EXECUTION_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  PAUSED: "paused",
  CANCELLED: "cancelled",
} as const;
export type ExecutionStatus =
  (typeof EXECUTION_STATUS)[keyof typeof EXECUTION_STATUS];

/** 节点运行态 */
export const NODE_RUN_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;
export type NodeRunStatus =
  (typeof NODE_RUN_STATUS)[keyof typeof NODE_RUN_STATUS];

/** 画布缩放边界 */
export const ZOOM = { MIN: 0.1, MAX: 4, DEFAULT: 1 } as const;

/** 自动保存防抖（ms） */
export const AUTOSAVE_DEBOUNCE_MS = 2000;
