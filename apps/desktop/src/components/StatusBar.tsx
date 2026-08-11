import { useCanvasStore, type SyncStatus } from "../store/canvasStore.js";
import { statusColorVar } from "@flux/ui";
import { EXECUTION_STATUS } from "@flux/shared";
import { useLocalSchedulerStore, type LocalWorkflowScheduleView } from "../store/localSchedulerStore.js";

const LABEL: Record<SyncStatus, string> = {
  idle: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

const DOT: Record<SyncStatus, string> = {
  idle: statusColorVar.idle,
  saving: statusColorVar.running,
  saved: statusColorVar.success,
  error: statusColorVar.failed,
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
}

function formatScheduledTime(iso: string | null, timezone: string): string {
  if (!iso) return "尚未计算";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "尚未计算";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function scheduleStatusLabel(schedule: LocalWorkflowScheduleView): string {
  if (schedule.status === "disabled") return "已暂停";
  if (schedule.status === "invalid") return "计划设置有误";
  if (schedule.status === EXECUTION_STATUS.RUNNING) return "正在定时运行";
  if (schedule.status === EXECUTION_STATUS.FAILED) return "上次定时运行失败";
  if (schedule.status === EXECUTION_STATUS.PAUSED) return "等待人工确认";
  if (schedule.status === EXECUTION_STATUS.SUCCESS) return "上次定时运行完成";
  if (schedule.status === EXECUTION_STATUS.CANCELLED) return "上次定时运行已取消";
  return "等待触发";
}

function scheduleDot(schedule: LocalWorkflowScheduleView): string {
  if (schedule.status === "disabled") return statusColorVar.idle;
  if (schedule.status === EXECUTION_STATUS.RUNNING) return statusColorVar.running;
  if (schedule.status === EXECUTION_STATUS.SUCCESS) return statusColorVar.success;
  if (schedule.status === EXECUTION_STATUS.FAILED || schedule.status === "invalid") {
    return statusColorVar.failed;
  }
  return "var(--accent)";
}

export function StatusBar() {
  const status = useCanvasStore((s) => s.status);
  const error = useCanvasStore((s) => s.error);
  const lastSavedAt = useCanvasStore((s) => s.lastSavedAt);
  const workflowId = useCanvasStore((s) => s.workflowId);
  const schedulerActive = useLocalSchedulerStore((s) => s.active);
  const schedule = useLocalSchedulerStore((s) => workflowId ? s.workflows[workflowId] : undefined);
  const schedulerError = useLocalSchedulerStore((s) => s.serviceError);

  return (
    <footer
      style={{
        height: 24,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "0 var(--space-3)",
        background: "var(--bg-base)",
        borderTop: "1px solid var(--border-subtle)",
        color: "var(--text-muted)",
        fontSize: "var(--text-xs)",
      }}
    >
      <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {schedule ? (
          <span
            aria-label="定时器状态"
            title={`${scheduleStatusLabel(schedule)}。桌面应用运行期间自动触发。${schedule.lastScheduledFor ? ` 上次计划触发：${formatScheduledTime(schedule.lastScheduledFor, schedule.timezone)}。` : ""}${schedule.error ? ` ${schedule.error}` : ""}`}
            style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                flexShrink: 0,
                borderRadius: "var(--radius-full)",
                background: scheduleDot(schedule),
              }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              定时器 · {scheduleStatusLabel(schedule)}
              {schedule.nextRunAt ? ` · 下次 ${formatScheduledTime(schedule.nextRunAt, schedule.timezone)}` : ""}
              {schedule.lastRunAt ? ` · 上次 ${formatScheduledTime(schedule.lastRunAt, schedule.timezone)}` : ""}
            </span>
          </span>
        ) : schedulerActive ? (
          <span style={{ color: "var(--text-muted)" }}>定时器已启动 · 当前流程未设置计划</span>
        ) : null}
        {schedulerError ? <span style={{ color: "var(--danger)" }}>定时器：{schedulerError}</span> : null}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
        <span
          aria-label="保存状态"
          style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "var(--radius-full)",
              background: DOT[status],
            }}
          />
          {LABEL[status]}
          {status === "saved" && lastSavedAt ? ` · ${formatTime(lastSavedAt)}` : ""}
        </span>
        {status === "error" && error ? (
          <span style={{ color: "var(--danger)" }}>{error}</span>
        ) : null}
      </span>
    </footer>
  );
}
