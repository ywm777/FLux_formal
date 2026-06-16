import { Badge, type BadgeStatus } from "@flux/ui";
import { useAppStore } from "../../store/appStore.js";
import type { NodeRunResult } from "../../lib/api.js";

const RUN_TO_BADGE: Record<NodeRunResult["status"], BadgeStatus> = {
  pending: "idle",
  running: "running",
  success: "success",
  failed: "failed",
  skipped: "idle",
};

/** 任务视图：纯执行层，无任何编辑入口（见 PRD 4.5） */
export function TasksView() {
  const exec = useAppStore((s) => s.lastExecution);

  if (!exec) {
    return (
      <div style={empty}>
        在画布搭建工作流并点击「运行」后，这里会显示执行结果与日志。
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", padding: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <strong style={{ fontSize: "var(--text-lg)" }}>最近执行</strong>
        <Badge status={exec.status === "success" ? "success" : "failed"} />
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          {exec.executionId}
        </span>
      </div>

      <div style={section}>节点运行（{exec.runs.length}）</div>
      {exec.runs.map((run) => (
        <div key={run.nodeId} style={row}>
          <Badge status={RUN_TO_BADGE[run.status]} label={run.status} />
          <span style={{ flex: 1 }}>{run.nodeId}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            {run.type}
          </span>
          {run.error && <span style={{ color: "var(--danger)" }}>{run.error}</span>}
        </div>
      ))}

      <div style={{ ...section, marginTop: "var(--space-5)" }}>日志（{exec.logs.length}）</div>
      <div style={logBox}>
        {exec.logs.length === 0 && <span style={{ color: "var(--text-muted)" }}>暂无日志</span>}
        {exec.logs.map((log, i) => (
          <div key={i}>
            <span style={{ color: "var(--text-muted)" }}>[{log.level}]</span>{" "}
            <span style={{ color: "var(--accent)" }}>@{log.nodeId}</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}

const empty: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-muted)",
  padding: "var(--space-6)",
  textAlign: "center",
};

const section: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--text-muted)",
  marginBottom: "var(--space-2)",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-2) var(--space-3)",
  marginBottom: "var(--space-1)",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
};

const logBox: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-sm)",
  background: "var(--bg-inset)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3)",
  lineHeight: 1.6,
};
