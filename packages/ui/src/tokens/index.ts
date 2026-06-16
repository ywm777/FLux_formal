/** 载体类型对应的 CSS 变量名（用于 NodeShell 色条/图标） */
export const carrierColorVar = {
  app: "var(--carrier-app)",
  code: "var(--carrier-code)",
  ai: "var(--carrier-ai)",
  data: "var(--carrier-data)",
  subflow: "var(--carrier-subflow)",
  trigger: "var(--carrier-trigger)",
  basic: "var(--carrier-basic)",
} as const;

export type CarrierColorKey = keyof typeof carrierColorVar;

/** 任务状态 → 状态色变量 */
export const statusColorVar = {
  idle: "var(--text-muted)",
  running: "var(--info)",
  success: "var(--success)",
  failed: "var(--danger)",
  paused: "var(--warning)",
} as const;
