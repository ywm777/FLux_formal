import type { CSSProperties } from "react";
import { statusColorVar } from "../tokens/index.js";

export type BadgeStatus = keyof typeof statusColorVar;

const LABELS: Record<BadgeStatus, string> = {
  idle: "空闲",
  running: "运行中",
  success: "成功",
  failed: "失败",
  paused: "已暂停",
};

export interface BadgeProps {
  status: BadgeStatus;
  label?: string;
}

export function Badge({ status, label }: BadgeProps) {
  const color = statusColorVar[status];
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    fontSize: "var(--text-xs)",
    color,
    fontFamily: "var(--font-sans)",
  };
  const dot: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: "var(--radius-full)",
    background: color,
  };
  return (
    <span style={style}>
      <span style={dot} />
      {label ?? LABELS[status]}
    </span>
  );
}
