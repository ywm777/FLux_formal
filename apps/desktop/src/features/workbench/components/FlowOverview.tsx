import type {
  WorkbenchFlowFilter,
  WorkbenchFlowOverview,
} from "../domain/workbenchFlowProjection.js";

interface FlowOverviewProps {
  overview: WorkbenchFlowOverview;
  activeFilter: WorkbenchFlowFilter;
  onFilterChange: (filter: WorkbenchFlowFilter) => void;
}

const METRICS: Array<{
  filter: WorkbenchFlowFilter;
  label: string;
  detail: string;
  value: keyof WorkbenchFlowOverview;
}> = [
  { filter: "all", label: "全部流程", detail: "当前工作空间", value: "total" },
  { filter: "attention", label: "需要关注", detail: "失败、异常或待确认", value: "attention" },
  { filter: "running", label: "运行中", detail: "正在处理节点", value: "running" },
  { filter: "scheduled", label: "等待触发", detail: "已进入自动计划", value: "scheduled" },
  { filter: "completed", label: "最近完成", detail: "上次运行成功", value: "completed" },
];

export function FlowOverview({
  overview,
  activeFilter,
  onFilterChange,
}: FlowOverviewProps) {
  return (
    <section className="workbench-flow-overview" aria-label="流程运行总览">
      {METRICS.map((metric) => {
        const active = activeFilter === metric.filter;
        return (
          <button
            key={metric.filter}
            type="button"
            className="workbench-flow-metric"
            data-tone={metric.filter}
            data-active={active ? "true" : "false"}
            aria-pressed={active}
            aria-label={`${metric.label}：${overview[metric.value]}`}
            onClick={() => onFilterChange(metric.filter)}
          >
            <span className="workbench-flow-metric-head">
              <span className="workbench-flow-metric-dot" aria-hidden="true" />
              <span>{metric.label}</span>
            </span>
            <strong>{overview[metric.value]}</strong>
            <span className="workbench-flow-metric-detail">{metric.detail}</span>
          </button>
        );
      })}
    </section>
  );
}
