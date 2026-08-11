import type { WorkbenchFlowItem } from "../domain/workbenchFlowProjection.js";

export function FlowRuntimeStatus({ flow }: { flow: WorkbenchFlowItem }) {
  const timing = runtimeTiming(flow);
  return (
    <span className="workbench-runtime" data-state={flow.state}>
      <span className="workbench-runtime-heading">
        <span className="workbench-runtime-dot" aria-hidden="true" />
        <strong>{flow.statusLabel}</strong>
      </span>
      <span className="workbench-runtime-detail" title={flow.error ?? undefined}>
        {timing ?? flow.statusDetail}
      </span>
      {flow.state === "running" ? (
        <span
          className="workbench-runtime-progress"
          role="progressbar"
          aria-label={`${flow.workflow.title} 运行进度`}
          aria-valuetext="正在运行"
        >
          <span />
        </span>
      ) : null}
    </span>
  );
}

function runtimeTiming(flow: WorkbenchFlowItem): string | null {
  if (flow.state === "attention" && flow.error) return flow.error;
  if (flow.state === "scheduled" && flow.nextRunAt) {
    return `下次 ${formatRuntimeTime(flow.nextRunAt, flow.timezone)}`;
  }
  if (flow.state === "completed" && flow.lastRunAt) {
    return `完成于 ${formatRuntimeTime(flow.lastRunAt, flow.timezone)}`;
  }
  return null;
}

function formatRuntimeTime(value: string, timezone: string | null): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      ...(timezone ? { timeZone: timezone } : {}),
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toLocaleString("zh-CN");
  }
}
