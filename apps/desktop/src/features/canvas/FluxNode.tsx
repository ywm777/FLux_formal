import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { NODE_RUN_STATUS, type NodeRunStatus } from "@flux/shared";
import {
  carrierColorVar,
  statusColorVar,
  type CarrierColorKey,
  type FormSchema,
  type FormValue,
} from "@flux/ui";
import { getNodeTypeSummary } from "../../lib/nodeDisplay.js";
import { formatExecutionMessage } from "../../lib/executionDisplay.js";
import type {
  NodeBusinessControl,
  NodeBusinessKind,
  NodeBusinessPresentation,
} from "./nodeBusinessSurface.js";
import {
  createCanvasHandleId,
  type CanvasHandleAnchor,
} from "./canvasHandles.js";
import {
  buildCronExpression,
  CRON_INTERVAL_OPTIONS,
  CRON_SCHEDULE_MODE_OPTIONS,
  CRON_TIMEZONE_OPTIONS,
  CRON_WEEKDAY_OPTIONS,
  cronValidationError,
  describeCronSchedule,
  parseCronSchedule,
  type CronScheduleMode,
} from "./cronSchedule.js";

export interface FluxNodeActions {
  append: () => void;
  openSettings: () => void;
  duplicate: () => void;
  delete: () => void;
  beginResize: () => void;
  resetSize: () => void;
  updateConfig: (key: string, value: unknown) => void;
  beginConnection?: (
    handleId: string,
    pointer: { pointerId: number; clientX: number; clientY: number },
  ) => void;
}

export interface FluxNodeRunState {
  status: NodeRunStatus;
  outputCount?: number;
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface FluxNodeRuntimeInput {
  schema: FormSchema;
  draftKey: string;
  initialValue: FormValue;
  error?: string | null;
  disabled?: boolean;
  upstreamConnected?: boolean;
  onChange: (value: FormValue) => void;
}

export interface FluxNodeApproval {
  awaiting: boolean;
  disabled?: boolean;
  onDecision: (decision: "approved" | "rejected") => void;
}

export interface FluxNodeData extends Record<string, unknown> {
  label: string;
  fluxType: string;
  carrier: CarrierColorKey;
  inputs: { id: string; name: string; dataType?: string; capacity?: "one" | "many" }[];
  outputs: { id: string; name: string; dataType?: string; capacity?: "one" | "many" }[];
  config: Record<string, unknown>;
  executionStep?: number;
  showRunOutput?: boolean;
  presentation?: NodeBusinessPresentation;
  runtimeInput?: FluxNodeRuntimeInput;
  approval?: FluxNodeApproval;
  run?: FluxNodeRunState;
  isErrorHandler?: boolean;
  hasCustomSize?: boolean;
  multiSelected?: boolean;
  allowHoverToolbar?: boolean;
  connectedConnectionHandleIds?: string[];
  selectedConnectionHandleIds?: string[];
  candidateConnectionHandleIds?: string[];
  invalidConnectionHandleIds?: string[];
  actions?: FluxNodeActions;
}

const RUN_LABEL: Record<NodeRunStatus, string> = {
  [NODE_RUN_STATUS.PENDING]: "等待中",
  [NODE_RUN_STATUS.RUNNING]: "运行中",
  [NODE_RUN_STATUS.SUCCESS]: "已完成",
  [NODE_RUN_STATUS.FAILED]: "失败",
  [NODE_RUN_STATUS.SKIPPED]: "已跳过",
};

const RUN_COLOR: Record<NodeRunStatus, string> = {
  [NODE_RUN_STATUS.PENDING]: statusColorVar.idle,
  [NODE_RUN_STATUS.RUNNING]: statusColorVar.running,
  [NODE_RUN_STATUS.SUCCESS]: statusColorVar.success,
  [NODE_RUN_STATUS.FAILED]: statusColorVar.failed,
  [NODE_RUN_STATUS.SKIPPED]: statusColorVar.idle,
};

const NODE_WIDTH: Record<NodeBusinessKind, number> = {
  "runtime-input": 328,
  source: 286,
  trigger: 304,
  decision: 304,
  approval: 310,
  "error-handler": 270,
  output: 342,
  action: 270,
  process: 246,
};

const NODE_MIN_WIDTH: Record<NodeBusinessKind, number> = {
  "runtime-input": 280,
  source: 240,
  trigger: 240,
  decision: 250,
  approval: 260,
  "error-handler": 240,
  output: 280,
  action: 230,
  process: 220,
};

const FALLBACK_PRESENTATION: NodeBusinessPresentation = {
  kind: "process",
  roleLabel: "处理步骤",
  controls: [],
};

function formatInlineOutput(outputs: Record<string, unknown> | undefined): string {
  if (!outputs) return "";
  const preferredKeys = ["text", "summary", "result", "message", "value", "data", "items"];
  let value: unknown;
  for (const key of preferredKeys) {
    if (outputs[key] !== undefined) {
      value = outputs[key];
      break;
    }
  }
  if (value === undefined) {
    const entries = Object.entries(outputs);
    value = entries.length === 1 ? entries[0]?.[1] : outputs;
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.json !== undefined) value = record.json;
    else if (typeof record.text === "string") value = record.text;
    else if (record.result !== undefined) value = record.result;
  }

  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return text;
}

export function FluxNode({ data, selected, width, height }: NodeProps) {
  const d = data as FluxNodeData;
  const presentation = d.presentation ?? FALLBACK_PRESENTATION;
  const color = d.isErrorHandler
    ? "var(--danger)"
    : carrierColorVar[d.carrier] ?? carrierColorVar.basic;
  const runLabel = d.run ? RUN_LABEL[d.run.status] : "待执行";
  const processStatus = d.run?.status ?? "idle";
  const visualRunStatus = d.run?.status ?? NODE_RUN_STATUS.PENDING;
  const shouldShowOutput =
    d.run?.status === NODE_RUN_STATUS.SUCCESS &&
    (
      d.showRunOutput ||
      presentation.kind === "runtime-input" ||
      presentation.kind === "output" ||
      presentation.kind === "action"
    );
  const inlineOutput = shouldShowOutput ? formatInlineOutput(d.run?.outputs) : "";
  const [payloadOpen, setPayloadOpen] = useState(d.fluxType === "flux.source.textConstant");
  const [copyState, setCopyState] = useState("");
  const [hovered, setHovered] = useState(false);
  const hasCustomSize = d.hasCustomSize === true;
  const hasCustomHeight = hasCustomSize && typeof height === "number";
  const showIndividualControls = selected && d.multiSelected !== true;

  async function copyOutput() {
    if (!inlineOutput) return;
    try {
      await navigator.clipboard.writeText(inlineOutput);
      setCopyState("已复制");
    } catch {
      setCopyState("复制失败");
    }
  }

  const branchPorts = presentation.kind === "decision" || presentation.kind === "approval";

  return (
    <div
      className="flux-business-node nowheel"
      data-node-kind={presentation.kind}
      data-selected={selected ? "true" : "false"}
      data-resized={hasCustomSize ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={nodeShellStyle(
        presentation.kind,
        selected,
        hasCustomSize ? width : undefined,
        hasCustomHeight ? height : undefined,
      )}
    >
      <NodeResizer
        isVisible={showIndividualControls}
        minWidth={NODE_MIN_WIDTH[presentation.kind]}
        minHeight={128}
        maxWidth={760}
        maxHeight={680}
        color="var(--accent)"
        handleClassName="canvas-node-resize-handle"
        lineClassName="canvas-node-resize-line"
        handleStyle={resizeHandleStyle}
        lineStyle={resizeLineStyle}
        onResizeStart={() => d.actions?.beginResize()}
      />

      <NodeToolbar
        isVisible={showIndividualControls || (hovered && d.allowHoverToolbar !== false)}
        position={Position.Top}
        offset={10}
      >
        <div
          className="canvas-node-toolbar nodrag nopan"
          style={toolbarStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <ToolbarButton label="追加下游节点" onClick={d.actions?.append} icon="append" />
          <ToolbarButton label="高级设置" onClick={d.actions?.openSettings} icon="settings" />
          <ToolbarButton label="恢复默认尺寸" onClick={d.actions?.resetSize} icon="reset-size" />
          <ToolbarButton label="复制节点" onClick={d.actions?.duplicate} icon="duplicate" />
          <ToolbarButton label="删除节点" onClick={d.actions?.delete} icon="delete" danger />
        </div>
      </NodeToolbar>

      <div style={hasCustomHeight ? { ...nodeSurfaceStyle, height: "100%" } : nodeSurfaceStyle}>
        <div aria-hidden style={nodeHighlightStyle} />
        <div aria-hidden style={nodeTintStyle(color)} />
        <div aria-hidden style={accentRailStyle(color)} />
        {d.run ? <div aria-hidden style={runStatusRailStyle(d.run.status)} /> : null}

        <header style={nodeHeaderStyle}>
          <span aria-hidden style={roleIconStyle(color)}>
            <NodeRoleIcon kind={presentation.kind} />
          </span>
          <div style={nodeIdentityStyle}>
            <span style={titleTextStyle}>{d.label}</span>
            <div style={nodeMetaRowStyle}>
              <span style={roleLabelStyle}>{presentation.roleLabel}</span>
              <span
                className="canvas-node-run-badge"
                data-status={processStatus}
                aria-label={`过程状态：${runLabel}${d.run?.error ? `。${formatExecutionMessage(d.run.error)}` : ""}`}
                title={d.run?.error ? formatExecutionMessage(d.run.error) : `过程状态：${runLabel}`}
                style={runBadgeStyle(visualRunStatus)}
              >
                <span
                  className="canvas-node-run-dot"
                  data-status={processStatus}
                  style={runDotStyle(visualRunStatus)}
                />
                {runLabel}
              </span>
            </div>
          </div>
          <div style={nodeStepSlotStyle}>
            {typeof d.executionStep === "number" ? (
              <span
                aria-label={`执行顺序：第 ${d.executionStep} 步`}
                title={`第 ${d.executionStep} 步执行`}
                style={stepBadgeStyle}
              >
                {d.executionStep}
              </span>
            ) : null}
          </div>
        </header>

        <div className="nowheel" style={resizableNodeBodyStyle(hasCustomHeight)}>
          {d.run?.status === NODE_RUN_STATUS.FAILED && d.run.error ? (
            <div role="alert" title={formatExecutionMessage(d.run.error)} style={nodeFailureStyle}>
              {formatExecutionMessage(d.run.error)}
            </div>
          ) : null}
          {renderBusinessSurface({
            data: d,
            presentation,
            color,
            inlineOutput,
            fillAvailable: hasCustomHeight,
            payloadOpen,
            setPayloadOpen,
            copyState,
            copyOutput,
          })}
        </div>
      </div>

      {inputAnchors(d.inputs.length, d.outputs.length).flatMap((anchor) =>
        d.inputs.map((port, index) => (
          <Handle
            key={`target-${anchor}-${port.id}`}
            className={canvasPortHandleClassName(d, createCanvasHandleId("target", port.id, anchor))}
            type="target"
            isConnectable={false}
            isConnectableStart={false}
            isConnectableEnd={false}
            position={positionForAnchor(anchor)}
            id={createCanvasHandleId("target", port.id, anchor)}
            onPointerDownCapture={canvasPortPointerDown(
              d,
              createCanvasHandleId("target", port.id, anchor),
            )}
            aria-label={`${anchorLabel(anchor)}输入：${port.name}`}
            style={perimeterHandleStyle(color, anchor, index, d.inputs.length)}
          />
        )),
      )}
      {!branchPorts && outputAnchors(d.inputs.length, d.outputs.length).flatMap((anchor) =>
        d.outputs.map((port, index) => (
          <Handle
            key={`source-${anchor}-${port.id}`}
            className={canvasPortHandleClassName(d, createCanvasHandleId("source", port.id, anchor))}
            type="source"
            isConnectable={false}
            isConnectableStart={false}
            isConnectableEnd={false}
            position={positionForAnchor(anchor)}
            id={createCanvasHandleId("source", port.id, anchor)}
            onPointerDownCapture={canvasPortPointerDown(
              d,
              createCanvasHandleId("source", port.id, anchor),
            )}
            aria-label={`${anchorLabel(anchor)}输出：${port.name}`}
            style={perimeterHandleStyle(color, anchor, index, d.outputs.length)}
          />
        )),
      )}
      {branchPorts && BRANCH_EXTRA_OUTPUT_ANCHORS.flatMap((anchor) =>
        d.outputs.map((port, index) => (
          <Handle
            key={`source-${anchor}-${port.id}`}
            className={canvasPortHandleClassName(d, createCanvasHandleId("source", port.id, anchor))}
            type="source"
            isConnectable={false}
            isConnectableStart={false}
            isConnectableEnd={false}
            position={positionForAnchor(anchor)}
            id={createCanvasHandleId("source", port.id, anchor)}
            onPointerDownCapture={canvasPortPointerDown(
              d,
              createCanvasHandleId("source", port.id, anchor),
            )}
            aria-label={`${anchorLabel(anchor)}分支输出：${port.name}`}
            style={perimeterHandleStyle(color, anchor, index, d.outputs.length)}
          />
        )),
      )}
      {branchPorts ? d.outputs.map((port, index) => (
        <Handle
          key={`source-bottom-${port.id}`}
          className={canvasPortHandleClassName(d, createCanvasHandleId("source", port.id, "bottom"))}
          type="source"
          isConnectable={false}
          isConnectableStart={false}
          isConnectableEnd={false}
          position={Position.Bottom}
          id={createCanvasHandleId("source", port.id, "bottom")}
          onPointerDownCapture={canvasPortPointerDown(
            d,
            createCanvasHandleId("source", port.id, "bottom"),
          )}
          aria-label={`下方分支：${port.name}`}
          style={perimeterHandleStyle(color, "bottom", index, d.outputs.length)}
        />
      )) : null}
    </div>
  );
}

interface BusinessSurfaceProps {
  data: FluxNodeData;
  presentation: NodeBusinessPresentation;
  color: string;
  inlineOutput: string;
  fillAvailable: boolean;
  payloadOpen: boolean;
  setPayloadOpen: (open: boolean) => void;
  copyState: string;
  copyOutput: () => void;
}

function renderBusinessSurface(props: BusinessSurfaceProps) {
  const { data, presentation } = props;
  if (data.fluxType === "flux.trigger.cron") {
    return <CronScheduleSurface data={data} />;
  }
  const controls = (
    <InlineControls
      controls={presentation.controls}
      config={data.config}
      onChange={data.actions?.updateConfig}
    />
  );

  if (presentation.kind === "runtime-input") {
    const completedInput = data.run?.status === NODE_RUN_STATUS.SUCCESS
      ? formatInlineOutput(data.run.outputs)
      : "";
    return data.runtimeInput ? (
      <RuntimeInputSurface
        key={data.runtimeInput.draftKey}
        interaction={data.runtimeInput}
        fillAvailable={props.fillAvailable}
        receivedValue={props.inlineOutput}
        copyState={props.copyState}
        onCopy={props.copyOutput}
      />
    ) : completedInput ? (
      <div className="nodrag nopan nowheel" data-canvas-shortcuts="ignore" style={runtimePreviewStyle}>
        <span style={runtimeLabelStyle}>本次输入</span>
        <pre tabIndex={0} title={completedInput} style={runtimePreviewValueStyle}>{completedInput}</pre>
      </div>
    ) : (
      <div style={quietStateStyle}>
        <span>本次运行输入</span>
        <strong>运行时填写</strong>
      </div>
    );
  }

  if (presentation.kind === "source") {
    const payload = presentation.payload;
    const payloadValue = payload
      ? String(data.config[payload.key] ?? payload.defaultValue ?? "")
      : "";
    return (
      <>
        {controls}
        {payload ? (
          <div className="nodrag nopan nowheel" data-canvas-shortcuts="ignore" style={payloadBlockStyle}>
            <button
              type="button"
              className="canvas-node-inline-button"
              aria-expanded={props.payloadOpen}
              onClick={() => props.setPayloadOpen(!props.payloadOpen)}
              style={payloadToggleStyle}
            >
              <span>{payload.label}</span>
              <span aria-hidden>{props.payloadOpen ? "收起" : "编辑"}</span>
            </button>
            {props.payloadOpen ? (
              <textarea
                aria-label={payload.label}
                value={payloadValue}
                spellCheck={false}
                onChange={(event) => data.actions?.updateConfig(payload.key, event.target.value)}
                style={payloadTextareaStyle}
              />
            ) : null}
          </div>
        ) : null}
        {!presentation.controls.length && !payload ? (
          <Description text={presentation.description ?? getNodeTypeSummary(data.fluxType)} />
        ) : null}
      </>
    );
  }

  if (presentation.kind === "decision") {
    return (
      <>
        {controls}
        <BranchPorts data={data} color={props.color} />
      </>
    );
  }

  if (presentation.kind === "approval") {
    return (
      <>
        {controls}
        {data.approval?.awaiting ? (
          <div className="nodrag nopan nowheel" style={approvalActionsStyle}>
            <button
              type="button"
              className="canvas-node-decision-button"
              disabled={data.approval.disabled}
              onClick={() => data.approval?.onDecision("approved")}
              style={approveButtonStyle}
            >
              通过
            </button>
            <button
              type="button"
              className="canvas-node-decision-button"
              disabled={data.approval.disabled}
              onClick={() => data.approval?.onDecision("rejected")}
              style={rejectButtonStyle}
            >
              退回
            </button>
          </div>
        ) : (
          <div style={quietStateStyle}>
            <span>确认状态</span>
            <strong>{data.run ? RUN_LABEL[data.run.status] : "等待流程到达"}</strong>
          </div>
        )}
        <BranchPorts data={data} color={props.color} />
      </>
    );
  }

  if (presentation.kind === "output") {
    return props.inlineOutput ? (
      <DeliveryOutput
        value={props.inlineOutput}
        copyState={props.copyState}
        onCopy={props.copyOutput}
        fillAvailable={props.fillAvailable}
      />
    ) : (
      <div style={outputWaitingStyle}>
        <span style={outputWaitingMarkStyle} />
        <span>等待上游结果</span>
      </div>
    );
  }

  return (
    <>
      {controls}
      {!presentation.controls.length ? (
        <Description text={presentation.description ?? getNodeTypeSummary(data.fluxType)} />
      ) : null}
      {props.inlineOutput ? (
        <DeliveryOutput
          value={props.inlineOutput}
          copyState={props.copyState}
          onCopy={props.copyOutput}
          compact
          fillAvailable={props.fillAvailable}
        />
      ) : null}
    </>
  );
}

function Description({ text }: { text: string }) {
  return <p title={text} style={descriptionStyle}>{text}</p>;
}

const CRON_MODE_PRESENTATION: Record<Exclude<CronScheduleMode, "custom">, {
  label: string;
  hint: string;
}> = {
  daily: { label: "每天", hint: "固定时间" },
  weekdays: { label: "工作日", hint: "周一至周五" },
  weekly: { label: "每周", hint: "选择星期" },
  interval: { label: "按间隔", hint: "循环执行" },
};

function CronScheduleSurface({ data }: { data: FluxNodeData }) {
  const enabled = data.config.enabled !== false;
  const expression = String(data.config.cron ?? "0 9 * * *");
  const timezone = String(data.config.timezone ?? "Asia/Shanghai");
  const schedule = parseCronSchedule(expression);
  const [advancedOpen, setAdvancedOpen] = useState(schedule.mode === "custom");
  const [advancedTouched, setAdvancedTouched] = useState(false);
  const validationError = cronValidationError(expression);
  const showAdvanced = advancedOpen || schedule.mode === "custom";
  const scheduleDescription = describeCronSchedule(expression, timezone);
  const [scheduleTimezone, ...scheduleTimingParts] = scheduleDescription.split(" · ");
  const scheduleTiming = scheduleTimingParts.join(" · ");

  function updatePreset(patch: Partial<typeof schedule>) {
    const next = { ...schedule, ...patch };
    data.actions?.updateConfig("cron", buildCronExpression(next));
  }

  return (
    <div className="nodrag nopan nowheel" data-canvas-shortcuts="ignore" style={cronScheduleStyle}>
      <div style={cronActivationStyle(enabled)}>
        <span style={cronActivationCopyStyle}>
          <strong style={cronActivationTitleStyle}>定时执行</strong>
          <span style={cronActivationHintStyle}>{enabled ? "已开启，按计划自动运行" : "已暂停，计划设置会保留"}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="启用定时执行"
          className="canvas-node-switch"
          onClick={() => data.actions?.updateConfig("enabled", !enabled)}
          style={cronActivationSwitchStyle(enabled)}
        >
          <span style={cronActivationThumbStyle(enabled)} />
        </button>
      </div>

      <div role="status" aria-live="polite" style={cronSummaryStyle(Boolean(validationError), enabled)}>
        <span aria-hidden style={cronSummaryIconStyle(Boolean(validationError), enabled)}>
          <CronScheduleIcon />
        </span>
        <span style={cronSummaryContentStyle}>
          <span style={cronSummaryLabelStyle}>
            {!enabled ? `已暂停 · ${scheduleTimezone}` : validationError ? "需要检查" : `当前计划 · ${scheduleTimezone}`}
          </span>
          <strong style={cronSummaryTextStyle}>
            {!enabled ? `${scheduleTiming}（不会自动执行）` : validationError ? scheduleDescription : scheduleTiming}
          </strong>
        </span>
      </div>

      <fieldset style={cronSectionStyle}>
        <legend style={cronSectionLabelStyle}>运行频率</legend>
        <div aria-label="运行频率" style={cronModeGridStyle}>
          {CRON_SCHEDULE_MODE_OPTIONS.map((option) => {
            const selected = schedule.mode === option.value;
            const presentation = CRON_MODE_PRESENTATION[option.value];
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                className="cron-schedule-choice"
                data-selected={selected ? "true" : "false"}
                onClick={() => updatePreset({ mode: option.value })}
                style={cronModeButtonStyle(selected)}
              >
                <strong style={cronModeTitleStyle}>{presentation.label}</strong>
                <span style={cronModeHintStyle(selected)}>{presentation.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {schedule.mode !== "custom" ? (
        <section aria-label="计划详情" style={cronDetailsStyle}>
          {schedule.mode === "weekly" ? (
            <fieldset style={cronSectionStyle}>
              <legend style={cronSectionLabelStyle}>选择星期</legend>
              <div aria-label="选择星期" style={cronWeekdayGridStyle}>
                {CRON_WEEKDAY_OPTIONS.map((option) => {
                  const selected = schedule.weekday === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={selected}
                      className="cron-schedule-chip"
                      data-selected={selected ? "true" : "false"}
                      onClick={() => updatePreset({ weekday: option.value })}
                      style={cronWeekdayButtonStyle(selected)}
                    >
                      {option.label.slice(1)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {schedule.mode === "interval" ? (
            <fieldset style={cronSectionStyle}>
              <legend style={cronSectionLabelStyle}>间隔时间</legend>
              <div aria-label="间隔时间" style={cronIntervalGridStyle}>
                {CRON_INTERVAL_OPTIONS.map((minutes) => {
                  const selected = schedule.intervalMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      aria-label={minutes === 60 ? "每小时" : `每 ${minutes} 分钟`}
                      aria-pressed={selected}
                      className="cron-schedule-chip"
                      data-selected={selected ? "true" : "false"}
                      onClick={() => updatePreset({ intervalMinutes: minutes })}
                      style={cronIntervalButtonStyle(selected)}
                    >
                      {minutes === 60 ? "1 小时" : `${minutes} 分`}
                    </button>
                  );
                })}
              </div>
              <span style={cronContextHintStyle}>以自然时钟为准，不从保存时刻重新计时</span>
            </fieldset>
          ) : (
            <label style={cronProminentFieldStyle}>
              <span style={cronFieldHeadingStyle}>
                <span style={cronSectionLabelStyle}>执行时间</span>
                <span style={cronFieldMetaStyle}>24 小时制</span>
              </span>
              <input
                type="time"
                aria-label="执行时间"
                value={schedule.time}
                onChange={(event) => updatePreset({ time: event.target.value })}
                className="cron-schedule-control cron-schedule-time"
                style={cronTimeControlStyle}
              />
            </label>
          )}
        </section>
      ) : null}

      <label style={cronTimezoneFieldStyle}>
        <span style={cronTimezoneLabelStyle}>
          <CronGlobeIcon />
          <span>时区</span>
        </span>
        <select
          aria-label="时区"
          value={timezone}
          onChange={(event) => data.actions?.updateConfig("timezone", event.target.value)}
          className="cron-schedule-control"
          style={cronTimezoneControlStyle}
        >
          {!CRON_TIMEZONE_OPTIONS.some((option) => option.value === timezone) ? (
            <option value={timezone}>{timezone}</option>
          ) : null}
          {CRON_TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {schedule.mode === "custom" ? (
        <div style={cronCustomHeadingStyle}>
          <span>自定义计划</span>
          <span style={cronAdvancedBadgeStyle}>高级</span>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={showAdvanced}
          className="canvas-node-inline-button cron-schedule-advanced-toggle"
          onClick={() => setAdvancedOpen(!showAdvanced)}
          style={cronAdvancedToggleStyle}
        >
          <span style={cronAdvancedLabelStyle}>
            <span>高级设置</span>
            <span style={cronAdvancedDescriptionStyle}>Cron 表达式</span>
          </span>
          <span aria-hidden style={cronChevronStyle(showAdvanced)}><CronChevronIcon /></span>
        </button>
      )}

      {showAdvanced ? (
        <div style={cronAdvancedStyle}>
          <label style={cronAdvancedFieldStyle}>
            <span style={cronLabelStyle}>Cron 表达式</span>
            <input
              type="text"
              aria-label="Cron 表达式"
              aria-invalid={Boolean(validationError)}
              value={expression}
              spellCheck={false}
              onChange={(event) => data.actions?.updateConfig("cron", event.target.value)}
              onBlur={() => setAdvancedTouched(true)}
              className="cron-schedule-control"
              style={cronExpressionStyle(Boolean(validationError))}
            />
          </label>
          <span style={cronHintStyle}>仅复杂日期规则需要填写，共 5 段，例如：0 9 * * *</span>
          {validationError && advancedTouched ? (
            <span role="alert" style={cronErrorStyle}>{validationError}，请修改后再运行。</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CronScheduleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" focusable="false">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 5.8v4.6l3.1 1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function CronGlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.4 10h13.2M10 3c2 2 3 4.3 3 7s-1 5-3 7c-2-2-3-4.3-3-7s1-5 3-7Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
    </svg>
  );
}

function CronChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" focusable="false">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function InlineControls({
  controls,
  config,
  onChange,
}: {
  controls: NodeBusinessControl[];
  config: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
}) {
  if (controls.length === 0) return null;
  const destructiveControl = controls.find((control) => (
    control.destructive && Boolean(config[control.key] ?? control.defaultValue)
  ));
  return (
    <div className="nodrag nopan nowheel" data-canvas-shortcuts="ignore" style={inlineControlsStyle}>
      {controls.map((control) => {
        const value = config[control.key] ?? control.defaultValue;
        if (control.type === "boolean") {
          const checked = Boolean(value);
          const destructiveActive = Boolean(control.destructive && checked);
          return (
            <div key={control.key} style={inlineControlRowStyle}>
              <span
                title={control.description}
                style={inlineControlLabelStyle(destructiveActive)}
              >
                {control.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={control.label}
                className="canvas-node-switch"
                onClick={() => onChange?.(control.key, !checked)}
                style={switchStyle(checked)}
              >
                <span style={switchThumbStyle(checked)} />
              </button>
            </div>
          );
        }
        return (
          <label key={control.key} style={inlineControlRowStyle}>
            <span title={control.description} style={inlineControlLabelStyle(false)}>{control.label}</span>
            {control.type === "enum" ? (
              <select
                value={String(value ?? "")}
                aria-label={control.label}
                onChange={(event) => onChange?.(control.key, event.target.value)}
                style={inlineControlInputStyle}
              >
                {control.options?.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={control.type === "number" ? "number" : "text"}
                value={value === undefined ? "" : String(value)}
                aria-label={control.label}
                onChange={(event) => onChange?.(
                  control.key,
                  control.type === "number"
                    ? event.target.value === "" ? undefined : Number(event.target.value)
                    : event.target.value,
                )}
                style={inlineControlInputStyle}
              />
            )}
          </label>
        );
      })}
      {destructiveControl ? (
        <div role="status" style={destructiveNoticeStyle}>
          有损转换已开启：运行后会删除字段
        </div>
      ) : null}
    </div>
  );
}

function RuntimeInputSurface({
  interaction,
  fillAvailable,
  receivedValue,
  copyState,
  onCopy,
}: {
  interaction: FluxNodeRuntimeInput;
  fillAvailable: boolean;
  receivedValue: string;
  copyState: string;
  onCopy: () => void;
}) {
  const draftRef = useRef<FormValue>({ ...interaction.initialValue });
  const showReceived = Boolean(interaction.upstreamConnected && receivedValue);
  const fields = Object.entries(interaction.schema.fields);
  const fillRows = fields.map(([, field]) => (
    field.type === "boolean" || field.type === "enum" || field.type === "number"
      ? "max-content"
      : "minmax(104px, 1fr)"
  ));
  if (interaction.error) fillRows.push("max-content");

  if (showReceived) {
    return (
      <div
        className="nodrag nopan nowheel"
        data-canvas-shortcuts="ignore"
        style={receivedTextSurfaceStyle(fillAvailable)}
      >
        <DeliveryOutput
          value={receivedValue}
          copyState={copyState}
          onCopy={onCopy}
          fillAvailable={fillAvailable}
        />
      </div>
    );
  }

  function update(key: string, value: unknown) {
    draftRef.current = { ...draftRef.current, [key]: value };
    interaction.onChange(draftRef.current);
  }

  return (
    <div
      className="nodrag nopan nowheel"
      data-canvas-shortcuts="ignore"
      style={fillAvailable ? runtimeInputFillStyle(fillRows) : runtimeInputStyle}
    >
      {fields.map(([key, field]) => {
        const initialValue = draftRef.current[key];
        if (field.type === "boolean") {
          return (
            <label key={key} style={runtimeBooleanStyle}>
              <input
                type="checkbox"
                defaultChecked={Boolean(initialValue)}
                disabled={interaction.disabled}
                onChange={(event) => update(key, event.target.checked)}
              />
              {field.label}
            </label>
          );
        }
        if (field.type === "enum") {
          return (
            <label key={key} style={runtimeFieldStyle}>
              <span style={runtimeLabelStyle}>{field.label}</span>
              <select
                defaultValue={String(initialValue ?? "")}
                disabled={interaction.disabled}
                onChange={(event) => update(key, event.target.value)}
                style={runtimeControlStyle}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === "number") {
          return (
            <label key={key} style={runtimeFieldStyle}>
              <span style={runtimeLabelStyle}>{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                disabled={interaction.disabled}
                defaultValue={initialValue === undefined ? "" : String(initialValue)}
                onChange={(event) => update(key, event.target.value === "" ? undefined : Number(event.target.value))}
                style={runtimeControlStyle}
              />
            </label>
          );
        }
        return (
          <label key={key} style={fillAvailable ? runtimeFieldFillStyle : runtimeFieldStyle}>
            <span style={runtimeLabelStyle}>{field.label}</span>
            <textarea
              defaultValue={String(initialValue ?? "")}
              disabled={interaction.disabled}
              placeholder={"placeholder" in field ? field.placeholder : undefined}
              spellCheck={field.type === "code" ? false : undefined}
              onChange={(event) => update(key, event.target.value)}
              style={{
                ...runtimeTextareaStyle,
                ...(fillAvailable ? runtimeTextareaFillStyle : {}),
                fontFamily: field.type === "code" ? "var(--font-mono)" : "var(--font-sans)",
              }}
            />
          </label>
        );
      })}
      {interaction.error ? <div role="alert" style={runtimeErrorStyle}>{interaction.error}</div> : null}
    </div>
  );
}

function BranchPorts({ data, color }: { data: FluxNodeData; color: string }) {
  const activeOutputs = new Set(Object.keys(data.run?.outputs ?? {}));
  return (
    <div style={branchListStyle}>
      {data.outputs.map((port) => {
        const active = activeOutputs.has(port.id);
        return (
          <div key={port.id} data-active={active ? "true" : "false"} style={branchRowStyle(active)}>
            <span style={branchDotStyle(active)} />
            <span>{port.name}</span>
            {active ? <strong style={branchActiveStyle}>已选择</strong> : null}
            <Handle
              className={canvasPortHandleClassName(
                data,
                createCanvasHandleId("source", port.id, "right"),
                true,
              )}
              type="source"
              isConnectable={false}
              isConnectableStart={false}
              isConnectableEnd={false}
              position={Position.Right}
              id={createCanvasHandleId("source", port.id, "right")}
              onPointerDownCapture={canvasPortPointerDown(
                data,
                createCanvasHandleId("source", port.id, "right"),
              )}
              aria-label={`分支：${port.name}`}
              style={branchHandleStyle(color)}
            />
          </div>
        );
      })}
    </div>
  );
}

function DeliveryOutput({
  value,
  copyState,
  onCopy,
  compact = false,
  fillAvailable = false,
}: {
  value: string;
  copyState: string;
  onCopy: () => void;
  compact?: boolean;
  fillAvailable?: boolean;
}) {
  return (
    <div
      className="nodrag nopan nowheel"
      data-canvas-shortcuts="ignore"
      style={fillAvailable ? deliveryOutputFillStyle : deliveryOutputStyle}
    >
      <div style={deliveryHeaderStyle}>
        <span style={deliveryLabelStyle}>输出</span>
        <button
          type="button"
          className="nodrag nopan canvas-node-inline-button"
          onClick={onCopy}
          style={copyButtonStyle}
        >
          {copyState || "复制"}
        </button>
      </div>
      <pre
        aria-label="节点输出内容"
        className="nodrag nopan nowheel"
        data-canvas-shortcuts="ignore"
        tabIndex={0}
        title={value}
        style={deliveryValueStyle(compact, fillAvailable)}
      >
        {value}
      </pre>
    </div>
  );
}

function NodeRoleIcon({ kind }: { kind: NodeBusinessKind }) {
  if (kind === "runtime-input" || kind === "source") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <path d="M3 4.2h10M3 8h6.4M3 11.8h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
      </svg>
    );
  }
  if (kind === "trigger") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <circle cx="8" cy="8" r="4.7" fill="none" stroke="currentColor" strokeWidth="1.35" />
        <path d="M8 5.1V8l2 1.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
      </svg>
    );
  }
  if (kind === "decision") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <path d="M4 3.2v4.1c0 2.9 2.1 2.7 4 2.7h3.6M8 6.1l3.6-2.5M8 10l3.6 2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }
  if (kind === "approval") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <circle cx="8" cy="5.3" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M3.8 12.8c.5-2.2 2-3.3 4.2-3.3 1.2 0 2.2.3 2.9 1M11 12l1.2 1.2 2-2.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
      </svg>
    );
  }
  if (kind === "error-handler") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <path d="M8 2.2 12.8 4v3.6c0 3-1.8 5.1-4.8 6.2-3-1.1-4.8-3.2-4.8-6.2V4L8 2.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
        <path d="M8 5v3.2M8 10.8h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "output") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <path d="M3.2 4.2h5.5v7.6H3.2zM8.7 8h4.1M10.8 5.9 12.9 8l-2.1 2.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }
  if (kind === "action") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
        <path d="m3.1 8.5 9.9-5-3.2 9.1-2.2-3-4.5-1.1Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" focusable="false">
      <path d="M3.2 4h9.6M3.2 8h9.6M3.2 12h9.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <circle cx="5" cy="4" r="1" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1" fill="currentColor" />
      <circle cx="7" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function ToolbarButton({
  label,
  onClick,
  icon,
  danger = false,
}: {
  label: string;
  onClick?: () => void;
  icon: "append" | "settings" | "reset-size" | "duplicate" | "delete";
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="canvas-node-toolbar-button"
      data-tone={danger ? "danger" : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ ...toolbarButtonStyle, color: danger ? "var(--danger)" : "var(--text-primary)" }}
    >
      <ToolbarIcon name={icon} />
    </button>
  );
}

function ToolbarIcon({ name }: { name: "append" | "settings" | "reset-size" | "duplicate" | "delete" }) {
  if (name === "append") {
    return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" /></svg>;
  }
  if (name === "settings") {
    return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 1.8v1.5M8 12.7v1.5M1.8 8h1.5M12.7 8h1.5M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" /></svg>;
  }
  if (name === "duplicate") {
    return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.2" y="5.2" width="7.3" height="7.3" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3.5 10.8H3.1c-.9 0-1.6-.7-1.6-1.6V3.1c0-.9.7-1.6 1.6-1.6h6.1c.9 0 1.6.7 1.6 1.6v.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" /></svg>;
  }
  if (name === "reset-size") {
    return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5H2.5V6M10 13.5h3.5V10M2.8 5.7 6.2 2.3M13.2 10.3l-3.4 3.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" /></svg>;
  }
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 4.5h9.6M6.2 4.5V3.2c0-.5.4-.9.9-.9h1.8c.5 0 .9.4.9.9v1.3M4.5 6.2 5 12.4c.1.7.6 1.1 1.3 1.1h3.4c.7 0 1.2-.4 1.3-1.1l.5-6.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>;
}

function nodeShellStyle(
  kind: NodeBusinessKind,
  selected: boolean,
  width: number | undefined,
  height: number | undefined,
): CSSProperties {
  return {
    width: NODE_WIDTH[kind],
    ...(typeof width === "number" ? { width } : {}),
    height,
    minWidth: NODE_MIN_WIDTH[kind],
    minHeight: height === undefined ? undefined : 128,
    background: "linear-gradient(150deg, var(--bg-elevated) 0%, var(--bg-surface) 58%, var(--bg-inset) 145%)",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border-subtle)"}`,
    borderRadius: 8,
    overflow: "visible",
    position: "relative",
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    boxShadow: selected ? "var(--shadow-node-selected)" : "var(--shadow-node)",
    transition: "border-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard)",
  };
}

const toolbarStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2, padding: 3, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)" };
const toolbarButtonStyle: CSSProperties = { width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" };
const resizeHandleStyle: CSSProperties = { width: 8, height: 8, border: "2px solid var(--bg-base)", borderRadius: "var(--radius-sm)", background: "var(--accent)" };
const resizeLineStyle: CSSProperties = { borderColor: "color-mix(in srgb, var(--accent) 70%, transparent)" };
const nodeSurfaceStyle: CSSProperties = { position: "relative", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "inherit", isolation: "isolate" };
const nodeHighlightStyle: CSSProperties = { position: "absolute", top: 0, left: "var(--space-4)", right: "var(--space-4)", height: 1, background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)", opacity: 0.7, pointerEvents: "none" };
function nodeTintStyle(color: string): CSSProperties { return { position: "absolute", top: 0, left: 0, width: "46%", height: 1, background: `linear-gradient(90deg, ${color}, transparent)`, opacity: 0.9, pointerEvents: "none" }; }
function accentRailStyle(color: string): CSSProperties { return { position: "absolute", left: 0, top: 17, width: 2, height: 30, borderRadius: "0 var(--radius-full) var(--radius-full) 0", background: color, pointerEvents: "none" }; }
const nodeHeaderStyle: CSSProperties = { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", alignItems: "center", gap: "var(--space-3)", padding: "14px var(--space-3) var(--space-2) var(--space-4)" };
function roleIconStyle(color: string): CSSProperties { return { width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "var(--radius-full)", background: `color-mix(in srgb, ${color} 13%, var(--bg-inset))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`, color }; }
const nodeIdentityStyle: CSSProperties = { minWidth: 0, display: "grid", gap: 4 };
const nodeMetaRowStyle: CSSProperties = { minWidth: 0, display: "flex", alignItems: "center", gap: "var(--space-2)" };
const nodeStepSlotStyle: CSSProperties = { alignSelf: "start", minWidth: 22, display: "flex", justifyContent: "flex-end" };
const roleLabelStyle: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 600 };
const stepBadgeStyle: CSSProperties = { flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 6px", border: "none", borderRadius: "var(--radius-full)", background: "var(--bg-inset)", color: "var(--accent)", fontSize: "var(--text-xs)", fontWeight: 750, fontVariantNumeric: "tabular-nums", lineHeight: 1 };
const titleTextStyle: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "15px", fontWeight: 680 };
const nodeBodyStyle: CSSProperties = { position: "relative", zIndex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-2) var(--space-3) 14px var(--space-4)", overflow: "visible", overscrollBehavior: "contain" };
function resizableNodeBodyStyle(constrained: boolean): CSSProperties { return constrained ? { ...nodeBodyStyle, flex: "1 1 auto", overflow: "auto", scrollbarGutter: "stable" } : nodeBodyStyle; }
const descriptionStyle: CSSProperties = { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", margin: 0, color: "var(--text-muted)", fontSize: "var(--text-sm)", lineHeight: 1.5 };
const quietStateStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", color: "var(--text-muted)", fontSize: "var(--text-sm)" };
const inlineControlsStyle: CSSProperties = { display: "grid", gap: "var(--space-2)" };
const inlineControlRowStyle: CSSProperties = { minHeight: 32, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(92px, 1.15fr)", alignItems: "center", gap: "var(--space-2)" };
function inlineControlLabelStyle(warning: boolean): CSSProperties { return { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: warning ? "var(--warning)" : "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: warning ? 700 : undefined }; }
const inlineControlInputStyle: CSSProperties = { width: "100%", minWidth: 0, height: 30, padding: "0 var(--space-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "var(--text-xs)" };
const destructiveNoticeStyle: CSSProperties = { minHeight: 28, display: "flex", alignItems: "center", padding: "0 var(--space-2)", border: "1px solid color-mix(in srgb, var(--warning) 38%, transparent)", borderRadius: "var(--radius-sm)", background: "var(--warning-subtle)", color: "var(--warning)", fontSize: "var(--text-xs)", fontWeight: 650 };
const cronScheduleStyle: CSSProperties = { display: "grid", gap: "var(--space-3)" };
function cronActivationStyle(enabled: boolean): CSSProperties { return { minHeight: 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "9px var(--space-3)", border: `1px solid ${enabled ? "color-mix(in srgb, var(--success) 34%, var(--border-subtle))" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", background: enabled ? "color-mix(in srgb, var(--success) 8%, var(--bg-inset))" : "var(--bg-inset)" }; }
const cronActivationCopyStyle: CSSProperties = { minWidth: 0, display: "grid", gap: 2 };
const cronActivationTitleStyle: CSSProperties = { color: "var(--text-primary)", fontSize: "var(--text-xs)", fontWeight: 720 };
const cronActivationHintStyle: CSSProperties = { overflow: "hidden", color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.35, textOverflow: "ellipsis", whiteSpace: "nowrap" };
function cronActivationSwitchStyle(enabled: boolean): CSSProperties { return { flexShrink: 0, width: 40, height: 24, padding: 2, border: `1px solid ${enabled ? "var(--success)" : "var(--border-strong)"}`, borderRadius: "var(--radius-full)", background: enabled ? "var(--success)" : "var(--bg-base)", cursor: "pointer", boxShadow: enabled ? "0 0 0 3px var(--success-subtle)" : "none" }; }
function cronActivationThumbStyle(enabled: boolean): CSSProperties { return { display: "block", width: 18, height: 18, borderRadius: "var(--radius-full)", background: enabled ? "var(--text-inverse)" : "var(--text-muted)", transform: enabled ? "translateX(16px)" : "translateX(0)", transition: "transform var(--motion-fast) var(--ease-standard)" }; }
function cronSummaryStyle(invalid: boolean, enabled: boolean): CSSProperties { const tone = !enabled ? "var(--text-muted)" : invalid ? "var(--danger)" : "var(--accent)"; return { minHeight: 58, display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", alignItems: "center", gap: "var(--space-3)", padding: "10px var(--space-3)", border: `1px solid color-mix(in srgb, ${tone} 42%, var(--border-subtle))`, borderRadius: "var(--radius-md)", background: !enabled ? "var(--bg-inset)" : invalid ? "var(--danger-subtle)" : "color-mix(in srgb, var(--accent) 9%, var(--bg-inset))", color: !enabled ? "var(--text-muted)" : invalid ? "var(--danger)" : "var(--text-primary)", lineHeight: 1.4, boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)" }; }
function cronSummaryIconStyle(invalid: boolean, enabled: boolean): CSSProperties { const tone = !enabled ? "var(--text-muted)" : invalid ? "var(--danger)" : "var(--accent)"; return { width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", background: `color-mix(in srgb, ${tone} 16%, var(--bg-base))`, color: tone, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 24%, transparent)` }; }
const cronSummaryContentStyle: CSSProperties = { minWidth: 0, display: "grid", gap: 2 };
const cronSummaryLabelStyle: CSSProperties = { overflow: "hidden", color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 650, textOverflow: "ellipsis", whiteSpace: "nowrap" };
const cronSummaryTextStyle: CSSProperties = { color: "inherit", fontSize: "var(--text-xs)", fontWeight: 720, lineHeight: 1.45, overflowWrap: "anywhere" };
const cronSectionStyle: CSSProperties = { minWidth: 0, display: "grid", gap: 7, margin: 0, padding: 0, border: 0 };
const cronSectionLabelStyle: CSSProperties = { display: "block", width: "100%", margin: 0, padding: 0, color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 680, lineHeight: 1.4 };
const cronModeGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 };
function cronModeButtonStyle(selected: boolean): CSSProperties { return { minWidth: 0, minHeight: 48, display: "grid", alignContent: "center", justifyItems: "start", gap: 2, padding: "7px 10px", border: `1px solid ${selected ? "color-mix(in srgb, var(--accent) 64%, var(--border-strong))" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", background: selected ? "color-mix(in srgb, var(--accent) 13%, var(--bg-inset))" : "var(--bg-inset)", color: "var(--text-primary)", cursor: "pointer", textAlign: "left", boxShadow: selected ? "inset 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent)" : "none" }; }
const cronModeTitleStyle: CSSProperties = { fontSize: "var(--text-xs)", fontWeight: 720, lineHeight: 1.3 };
function cronModeHintStyle(selected: boolean): CSSProperties { return { color: selected ? "color-mix(in srgb, var(--accent) 72%, var(--text-primary))" : "var(--text-muted)", fontSize: "11px", lineHeight: 1.3 }; }
const cronDetailsStyle: CSSProperties = { display: "grid", gap: "var(--space-3)", padding: "10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "color-mix(in srgb, var(--bg-base) 72%, var(--bg-inset))" };
const cronWeekdayGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 };
function cronWeekdayButtonStyle(selected: boolean): CSSProperties { return { minWidth: 0, height: 32, padding: 0, border: `1px solid ${selected ? "var(--accent)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-sm)", background: selected ? "var(--accent)" : "var(--bg-inset)", color: selected ? "var(--text-inverse)" : "var(--text-primary)", cursor: "pointer", fontSize: "var(--text-xs)", fontWeight: selected ? 750 : 620 }; }
const cronIntervalGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 };
function cronIntervalButtonStyle(selected: boolean): CSSProperties { return { minWidth: 0, height: 34, padding: "0 var(--space-2)", border: `1px solid ${selected ? "var(--accent)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-sm)", background: selected ? "var(--accent)" : "var(--bg-inset)", color: selected ? "var(--text-inverse)" : "var(--text-primary)", cursor: "pointer", fontSize: "var(--text-xs)", fontWeight: selected ? 740 : 620, whiteSpace: "nowrap" }; }
const cronContextHintStyle: CSSProperties = { color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.4 };
const cronProminentFieldStyle: CSSProperties = { display: "grid", gap: 7 };
const cronFieldHeadingStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" };
const cronFieldMetaStyle: CSSProperties = { flexShrink: 0, color: "var(--text-muted)", fontSize: "11px", whiteSpace: "nowrap", wordBreak: "keep-all" };
const cronTimeControlStyle: CSSProperties = { width: "100%", minWidth: 0, height: 44, padding: "0 var(--space-3)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--bg-inset)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" };
const cronTimezoneFieldStyle: CSSProperties = { minHeight: 38, display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)", alignItems: "center", gap: "var(--space-2)", padding: "0 var(--space-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-inset)" };
const cronTimezoneLabelStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 650 };
const cronTimezoneControlStyle: CSSProperties = { width: "100%", minWidth: 0, height: 34, padding: "0 var(--space-1)", border: 0, background: "transparent", color: "var(--text-primary)", fontSize: "var(--text-xs)" };
const cronCustomHeadingStyle: CSSProperties = { minHeight: 34, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "var(--text-xs)", fontWeight: 670 };
const cronAdvancedBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 20, padding: "0 7px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-full)", background: "var(--bg-inset)", color: "var(--text-muted)", fontSize: "10px", fontWeight: 700 };
const cronAdvancedToggleStyle: CSSProperties = { minHeight: 42, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2)", border: "none", borderTop: "1px solid var(--border-subtle)", borderRadius: 0, background: "transparent", color: "var(--text-primary)", cursor: "pointer", textAlign: "left" };
const cronAdvancedLabelStyle: CSSProperties = { display: "grid", gap: 1 };
const cronAdvancedDescriptionStyle: CSSProperties = { color: "var(--text-muted)", fontSize: "11px", fontWeight: 500 };
function cronChevronStyle(open: boolean): CSSProperties { return { width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform var(--motion-fast) var(--ease-standard)" }; }
const cronAdvancedStyle: CSSProperties = { display: "grid", gap: "var(--space-2)", padding: "var(--space-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-base)" };
const cronAdvancedFieldStyle: CSSProperties = { display: "grid", gap: "var(--space-2)" };
const cronLabelStyle: CSSProperties = { color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 650 };
function cronExpressionStyle(invalid: boolean): CSSProperties { return { width: "100%", minWidth: 0, height: 38, padding: "0 var(--space-3)", border: `1px solid ${invalid ? "var(--danger)" : "var(--border-strong)"}`, borderRadius: "var(--radius-sm)", background: "var(--bg-inset)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }; }
const cronHintStyle: CSSProperties = { color: "var(--text-muted)", fontSize: "var(--text-xs)", lineHeight: 1.45 };
const cronErrorStyle: CSSProperties = { padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--danger-subtle)", color: "var(--danger)", fontSize: "var(--text-xs)", lineHeight: 1.45 };
function switchStyle(checked: boolean): CSSProperties { return { justifySelf: "end", width: 34, height: 20, padding: 2, border: `1px solid ${checked ? "var(--success)" : "var(--border-strong)"}`, borderRadius: "var(--radius-full)", background: checked ? "var(--success-subtle)" : "var(--bg-inset)", cursor: "pointer" }; }
function switchThumbStyle(checked: boolean): CSSProperties { return { display: "block", width: 14, height: 14, borderRadius: "var(--radius-full)", background: checked ? "var(--success)" : "var(--text-muted)", transform: checked ? "translateX(14px)" : "translateX(0)", transition: "transform var(--motion-fast) var(--ease-standard)" }; }
const payloadBlockStyle: CSSProperties = { display: "grid", gap: "var(--space-2)" };
const payloadToggleStyle: CSSProperties = { minHeight: 32, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "0 var(--space-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-inset)", color: "var(--text-primary)", cursor: "pointer", fontSize: "var(--text-xs)" };
const payloadTextareaStyle: CSSProperties = { width: "100%", height: 156, resize: "vertical", padding: "var(--space-2)", overflow: "auto", overscrollBehavior: "contain", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", lineHeight: 1.5 };
const runtimeInputStyle: CSSProperties = { display: "grid", gap: "var(--space-3)" };
function runtimeInputFillStyle(rows: string[]): CSSProperties { return { ...runtimeInputStyle, flex: "1 1 auto", height: "100%", minHeight: 0, gridTemplateRows: rows.join(" "), alignContent: "stretch" }; }
const runtimePreviewStyle: CSSProperties = { display: "grid", gap: "var(--space-2)" };
const runtimePreviewValueStyle: CSSProperties = { maxHeight: 92, overflow: "auto", overscrollBehavior: "contain", scrollbarGutter: "stable", margin: 0, padding: "var(--space-2) var(--space-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-inset)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
const runtimeFieldStyle: CSSProperties = { display: "grid", gap: "var(--space-2)" };
const runtimeFieldFillStyle: CSSProperties = { ...runtimeFieldStyle, minHeight: 0, gridTemplateRows: "auto minmax(0, 1fr)" };
const runtimeLabelStyle: CSSProperties = { color: "var(--text-muted)", fontSize: "var(--text-xs)", fontWeight: 650 };
function receivedTextSurfaceStyle(fillAvailable: boolean): CSSProperties { return { display: "grid", minHeight: 0, height: fillAvailable ? "100%" : undefined, gridTemplateRows: fillAvailable ? "minmax(0, 1fr)" : "auto" }; }
const runtimeBooleanStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--text-primary)", fontSize: "var(--text-sm)" };
const runtimeControlStyle: CSSProperties = { width: "100%", height: 34, padding: "0 var(--space-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--bg-inset)", color: "var(--text-primary)", fontSize: "var(--text-sm)" };
const runtimeTextareaStyle: CSSProperties = { width: "100%", minHeight: 104, maxHeight: 230, resize: "vertical", padding: "var(--space-3)", overflow: "auto", overscrollBehavior: "contain", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "var(--text-sm)", lineHeight: 1.55, boxShadow: "inset 0 1px 0 var(--bg-inset)" };
const runtimeTextareaFillStyle: CSSProperties = { height: "100%", minHeight: 0, maxHeight: "none", resize: "none" };
const runtimeErrorStyle: CSSProperties = { padding: "var(--space-2)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", background: "var(--danger-subtle)", color: "var(--danger)", fontSize: "var(--text-xs)" };
const nodeFailureStyle: CSSProperties = { padding: "var(--space-2) var(--space-3)", border: "1px solid color-mix(in srgb, var(--danger) 46%, transparent)", borderRadius: "var(--radius-sm)", background: "var(--danger-subtle)", color: "var(--danger)", fontSize: "var(--text-xs)", lineHeight: 1.5, overflowWrap: "anywhere" };
const approvalActionsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" };
const approveButtonStyle: CSSProperties = { minHeight: 34, border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", background: "var(--success-subtle)", color: "var(--success)", cursor: "pointer", fontWeight: 700 };
const rejectButtonStyle: CSSProperties = { minHeight: 34, border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", background: "var(--danger-subtle)", color: "var(--danger)", cursor: "pointer", fontWeight: 700 };
const branchListStyle: CSSProperties = { display: "grid", gap: 0, marginTop: "var(--space-1)" };
function branchRowStyle(active: boolean): CSSProperties { return { position: "relative", minHeight: 34, display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "0 var(--space-2)", borderBottom: "1px solid var(--border-subtle)", background: "transparent", boxShadow: active ? "inset 2px 0 0 var(--success)" : undefined, color: active ? "var(--text-primary)" : "var(--text-muted)", fontSize: "var(--text-xs)" }; }
function branchDotStyle(active: boolean): CSSProperties { return { width: 6, height: 6, borderRadius: "var(--radius-full)", background: active ? "var(--success)" : "var(--border-strong)" }; }
const branchActiveStyle: CSSProperties = { marginLeft: "auto", color: "var(--success)", fontWeight: 700 };
function branchHandleStyle(_color: string): CSSProperties { return { right: -3.5, top: "50%", width: 7, height: 7, background: "var(--bg-base)", border: "1px solid var(--border-strong)", boxShadow: "0 0 0 1px var(--bg-surface)" }; }
const outputWaitingStyle: CSSProperties = { minHeight: 32, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "var(--space-2)", padding: 0, border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "var(--text-sm)" };
const outputWaitingMarkStyle: CSSProperties = { width: 7, height: 7, borderRadius: "var(--radius-full)", background: "var(--border-strong)" };
const deliveryOutputStyle: CSSProperties = { display: "grid", gap: "var(--space-2)", minWidth: 0 };
const deliveryOutputFillStyle: CSSProperties = { ...deliveryOutputStyle, flex: "1 1 auto", height: "100%", minHeight: 0, gridTemplateRows: "auto minmax(0, 1fr)" };
const deliveryHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" };
const deliveryLabelStyle: CSSProperties = { color: "var(--success)", fontSize: "var(--text-xs)", fontWeight: 750 };
const copyButtonStyle: CSSProperties = { minHeight: 26, padding: "0 var(--space-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-inset)", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--text-xs)" };
function deliveryValueStyle(compact: boolean, fillAvailable: boolean): CSSProperties { return { minHeight: 0, maxHeight: fillAvailable ? undefined : compact ? 92 : 190, height: fillAvailable ? "100%" : undefined, margin: 0, padding: "var(--space-3)", overflow: "auto", overscrollBehavior: "contain", scrollbarGutter: "stable", touchAction: "pan-y", border: "none", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", boxShadow: "inset 2px 0 0 var(--success)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text", cursor: "text" }; }

function runBadgeStyle(status: NodeRunStatus): CSSProperties { return { flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 82, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: 0, border: "none", background: "transparent", color: RUN_COLOR[status], fontSize: "var(--text-xs)", fontWeight: 650 }; }
function runDotStyle(status: NodeRunStatus): CSSProperties { return { width: 6, height: 6, flexShrink: 0, borderRadius: "var(--radius-full)", background: RUN_COLOR[status] }; }
function runStatusRailStyle(status: NodeRunStatus): CSSProperties { return { position: "absolute", left: "var(--space-4)", right: "var(--space-3)", bottom: 0, height: 2, borderRadius: "var(--radius-full) var(--radius-full) 0 0", background: RUN_COLOR[status], pointerEvents: "none" }; }
const ALL_ANCHORS: CanvasHandleAnchor[] = ["top", "right", "bottom", "left"];
const BRANCH_EXTRA_OUTPUT_ANCHORS: CanvasHandleAnchor[] = ["top", "left"];
function inputAnchors(inputCount: number, _outputCount: number): CanvasHandleAnchor[] {
  if (inputCount === 0) return [];
  return ALL_ANCHORS;
}
function outputAnchors(_inputCount: number, outputCount: number): CanvasHandleAnchor[] {
  if (outputCount === 0) return [];
  return ALL_ANCHORS;
}
function positionForAnchor(anchor: CanvasHandleAnchor): Position {
  return {
    top: Position.Top,
    right: Position.Right,
    bottom: Position.Bottom,
    left: Position.Left,
  }[anchor];
}
function anchorLabel(anchor: CanvasHandleAnchor): string {
  return { top: "上方", right: "右侧", bottom: "下方", left: "左侧" }[anchor];
}
function portOffset(index: number, count: number): string {
  return count <= 1 ? "50%" : `${((index + 1) / (count + 1)) * 100}%`;
}
function canvasPortHandleClassName(
  data: FluxNodeData,
  handleId: string,
  branch = false,
): string {
  return [
    "canvas-port-handle",
    branch ? "canvas-port-handle-branch" : "",
    data.connectedConnectionHandleIds?.includes(handleId) ? "is-connected" : "",
    data.selectedConnectionHandleIds?.includes(handleId) ? "is-edge-selected" : "",
    data.candidateConnectionHandleIds?.includes(handleId) ? "is-reconnect-candidate" : "",
    data.invalidConnectionHandleIds?.includes(handleId) ? "is-connect-invalid" : "",
  ].filter(Boolean).join(" ");
}
function canvasPortPointerDown(data: FluxNodeData, handleId: string) {
  return (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    data.actions?.beginConnection?.(handleId, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };
}
function perimeterHandleStyle(
  _color: string,
  anchor: CanvasHandleAnchor,
  index: number,
  count: number,
): CSSProperties {
  const offset = portOffset(index, count);
  const axis = anchor === "left" || anchor === "right" ? { top: offset } : { left: offset };
  return {
    ...axis,
    width: 7,
    height: 7,
    background: "var(--bg-base)",
    border: "1px solid var(--border-strong)",
    boxShadow: "0 0 0 1px var(--bg-surface)",
  };
}
