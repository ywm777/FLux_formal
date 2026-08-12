import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@flux/ui";
import { useAppStore } from "../../store/appStore.js";
import { useCanvasStore } from "../../store/canvasStore.js";
import { useTasksStore } from "../../store/tasksStore.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { ShareWorkflowDialog } from "../sharing/ShareWorkflowDialog.js";
import {
  ContextMenu,
  type ContextMenuItem,
} from "../canvas/ContextMenu.js";
import {
  PUBLIC_WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from "../../lib/workflowTemplates.js";
import {
  isEditableShortcutTarget,
  matchesShortcut,
  shortcutLabel,
} from "../../lib/keyboardShortcuts.js";
import { useWorkspaceStore } from "../../store/workspaceStore.js";
import { useWorkflowCommands } from "../../app/WorkflowCommandProvider.js";
import { useWorkbenchService } from "../../app/WorkspaceServiceProvider.js";
import { useLocalSchedulerStore } from "../../store/localSchedulerStore.js";
import { localWorkflowScheduler } from "../../lib/localWorkflowScheduler.js";
import { FlowOverview } from "./components/FlowOverview.js";
import { FlowRuntimeStatus } from "./components/FlowRuntimeStatus.js";
import {
  matchesWorkbenchFlowFilter,
  projectWorkbenchFlows,
  type WorkbenchFlowFilter,
} from "./domain/workbenchFlowProjection.js";
import "./workbench.css";

const FLOW_FILTER_LABEL: Record<WorkbenchFlowFilter, string> = {
  all: "全部流程",
  attention: "需要关注",
  running: "运行中",
  scheduled: "等待触发",
  completed: "最近完成",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const elapsed = Date.now() - date.getTime();
  if (elapsed >= 0 && elapsed < 60_000) return "刚刚";
  if (elapsed >= 0 && elapsed < 3_600_000) {
    return `${Math.max(1, Math.floor(elapsed / 60_000))} 分钟前`;
  }
  if (elapsed >= 0 && elapsed < 86_400_000) {
    return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  }
  if (elapsed >= 0 && elapsed < 604_800_000) {
    return `${Math.floor(elapsed / 86_400_000)} 天前`;
  }
  return date.toLocaleDateString("zh-CN", {
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    month: "short",
    day: "numeric",
  });
}

export function WorkbenchView({ active = true }: { active?: boolean }) {
  const setMode = useAppStore((s) => s.setMode);
  const workflowCommands = useWorkflowCommands();
  const workbenchService = useWorkbenchService();
  const workflows = useTasksStore((s) => s.workflows);
  const loading = useTasksStore((s) => s.loading);
  const error = useTasksStore((s) => s.error);
  const load = useTasksStore((s) => s.load);
  const toggleFavorite = useTasksStore((s) => s.toggleFavorite);
  const removeWorkflow = useTasksStore((s) => s.removeWorkflow);
  const workspaceKind = useWorkspaceStore((s) => s.kind);
  const setWorkspaceKind = useWorkspaceStore((s) => s.setKind);
  const canvasLastSavedAt = useCanvasStore((s) => s.lastSavedAt);
  const localRuntimeSnapshots = useLocalSchedulerStore((s) => s.workflows);
  const schedulerError = useLocalSchedulerStore((s) => s.serviceError);

  useEffect(() => {
    if (active) void load(workspaceKind);
  }, [active, canvasLastSavedAt, load, workspaceKind]);

  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [flowFilter, setFlowFilter] = useState<WorkbenchFlowFilter>("all");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    workflowId: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function createWorkflow() {
    void workflowCommands.createDraft({ title: "未命名工作流" });
    setMode("canvas");
  }

  function createFromTemplate(template: WorkflowTemplate) {
    void workflowCommands.createDraft({
      title: template.title,
      templateId: template.id,
    });
    setMode("canvas");
  }

  function openWorkflowOnCanvas(workflowId: string) {
    setContextMenu(null);
    void workflowCommands.openWorkflow(workflowId);
    setMode("canvas");
  }

  function shareWorkflow(workflow: { id: string; title: string }) {
    setContextMenu(null);
    setShareTarget({ id: workflow.id, title: workflow.title });
  }

  async function exportWorkflow(workflowId: string) {
    setContextMenu(null);
    setFileError(null);
    try {
      await workbenchService.exportWorkflow(workflowId);
    } catch (failure) {
      setFileError(
        failure instanceof Error ? failure.message : "导出工作流失败",
      );
    }
  }

  async function importWorkflow(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError(null);
    try {
      const record = await workbenchService.importWorkflow(await file.text());
      await setWorkspaceKind("local");
      void workflowCommands.openWorkflow(record.id);
      setMode("canvas");
    } catch (failure) {
      setFileError(
        failure instanceof Error ? failure.message : "导入工作流失败",
      );
    }
  }

  async function confirmDeleteWorkflow() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeWorkflow(deleteTarget.id);
      setDeleteTarget(null);
      setContextMenu(null);
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof Error ? deleteFailure.message : "删除工作流失败",
      );
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!active) return;

    function onWorkbenchKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;

      if (matchesShortcut(event, "new-workflow")) {
        event.preventDefault();
        createWorkflow();
        return;
      }

      if (matchesShortcut(event, "focus-workflow-search")) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    window.addEventListener("keydown", onWorkbenchKeyDown);
    return () => window.removeEventListener("keydown", onWorkbenchKeyDown);
  }, [active]);

  const initialLoading = loading && workflows.length === 0;
  const workflowListEmpty = !loading && workflows.length === 0;
  const flowProjection = useMemo(
    () => projectWorkbenchFlows(
      workflows,
      workspaceKind === "local" ? localRuntimeSnapshots : {},
    ),
    [localRuntimeSnapshots, workflows, workspaceKind],
  );
  const visibleFlows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return flowProjection.items.filter((flow) => {
      const workflow = flow.workflow;
      if (favoritesOnly && !workflow.isFavorite) return false;
      if (!matchesWorkbenchFlowFilter(flow, flowFilter)) return false;
      if (!normalizedQuery) return true;
      return workflow.title.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [favoritesOnly, flowFilter, flowProjection.items, query]);
  const filteredListEmpty =
    !loading && workflows.length > 0 && visibleFlows.length === 0;
  const contextWorkflow = contextMenu
    ? workflows.find((workflow) => workflow.id === contextMenu.workflowId) ?? null
    : null;
  const contextMenuItems: ContextMenuItem[] = contextWorkflow
    ? [
        {
          label: "打开",
          icon: <WorkflowMenuIcon kind="open" />,
          onClick: () => openWorkflowOnCanvas(contextWorkflow.id),
        },
        {
          label: contextWorkflow.isFavorite ? "取消收藏" : "收藏",
          icon: <WorkflowMenuIcon kind="favorite" />,
          onClick: () => void toggleFavorite(contextWorkflow.id, contextWorkflow.isFavorite),
        },
        {
          label: "分享工作流",
          icon: <WorkflowMenuIcon kind="share" />,
          onClick: () => shareWorkflow(contextWorkflow),
        },
        {
          label: "导出 .flux",
          icon: <WorkflowMenuIcon kind="export" />,
          onClick: () => void exportWorkflow(contextWorkflow.id),
        },
        {
          label: "删除工作流",
          icon: <WorkflowMenuIcon kind="delete" />,
          danger: true,
          onClick: () => {
            setDeleteError(null);
            setDeleteTarget({ id: contextWorkflow.id, title: contextWorkflow.title });
          },
        },
      ]
    : [];

  return (
    <div
      style={shell}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!(event.target as Element).closest(".workbench-workflow-row")) {
          setContextMenu(null);
        }
      }}
    >
      <div style={frame}>
        <section style={launchHeader}>
          <div style={launchTitleBlock}>
            <h1 style={pageTitle}>工作台</h1>
            <p style={pageSubtitle}>
              {initialLoading
                ? workspaceKind === "local" ? "正在读取工作流" : "正在同步工作流"
                : `${workflows.length} 个流对象`}
              {!initialLoading && (
                <span> · {workspaceKind === "local" ? "本地空间" : "云端空间"}</span>
              )}
            </p>
          </div>

          <div style={launchActions}>
            <button
              type="button"
              aria-label="导入工作流"
              title="导入 .flux"
              className="workbench-icon-button"
              onClick={() => importInputRef.current?.click()}
              style={refreshButton}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2.5v7m0 0L5.3 6.8M8 9.5l2.7-2.7M3.5 11v1.5h9V11" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
              </svg>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".flux,application/json,application/vnd.flux.workflow+json"
              hidden
              onChange={(event) => void importWorkflow(event)}
            />
            <button
              type="button"
              aria-label="新建工作流"
              aria-keyshortcuts="N"
              title={`新建工作流 (${shortcutLabel("new-workflow")})`}
              className="workbench-primary-action"
              onClick={createWorkflow}
              style={newWorkflowButton}
            >
              新建工作流
            </button>
            <button
              type="button"
              aria-label="刷新工作流"
              title="刷新工作流"
              className="workbench-icon-button"
              onClick={() => void load(workspaceKind)}
              style={refreshButton}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12.8 5.3A5 5 0 0 0 3.4 4.1L2.5 5.8M3.2 10.7a5 5 0 0 0 9.4 1.2l.9-1.7"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
                <path
                  d="M2.4 3.2v2.7h2.7M13.6 12.8v-2.7h-2.7"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </div>
        </section>

        {(error || fileError) && (
          <div role="alert" style={errorBox}>
            <span>{fileError ?? error}</span>
            {error ? (
              <button type="button" onClick={() => void load(workspaceKind)} style={retryButton}>
                重试
              </button>
            ) : null}
          </div>
        )}

        {workspaceKind === "local" && schedulerError ? (
          <div role="alert" style={errorBox}>
            <span>运行状态暂时不可用：{schedulerError}</span>
            <button
              type="button"
              onClick={() => void localWorkflowScheduler.refresh()}
              style={retryButton}
            >
              重新连接
            </button>
          </div>
        ) : null}

        {!initialLoading && workflows.length > 0 ? (
          <FlowOverview
            overview={flowProjection.overview}
            activeFilter={flowFilter}
            onFilterChange={setFlowFilter}
          />
        ) : null}

        <section style={publishedSection}>
          <div style={publishedHeader}>
            <div style={sectionHeadingGroup}>
              <h2 style={sectionTitle}>{FLOW_FILTER_LABEL[flowFilter]}</h2>
              <span style={sectionDescription}>
                {flowFilter === "all" ? "按运行优先级排列" : "点击“全部流程”返回全局视图"}
              </span>
            </div>
            {workflows.length > 0 && (
              <div style={listTools}>
                <label style={searchWrap}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M7.1 11.2A4.1 4.1 0 1 1 7.1 3a4.1 4.1 0 0 1 0 8.2Zm3.3-.8 2.7 2.7"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.4"
                    />
                  </svg>
                  <input
                    ref={searchInputRef}
                    aria-label="搜索工作流"
                    aria-keyshortcuts="/"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setQuery("");
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="搜索工作流"
                    title={`搜索工作流 (${shortcutLabel("focus-workflow-search")})`}
                    style={searchInput}
                  />
                </label>
                <button
                  type="button"
                  aria-label={favoritesOnly ? "显示全部工作流" : "只看收藏"}
                  aria-pressed={favoritesOnly}
                  onClick={() => setFavoritesOnly((value) => !value)}
                  style={filterButton(favoritesOnly)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                    fill={favoritesOnly ? "currentColor" : "none"}
                  >
                    <path
                      d="m8 1.9 1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9L4.4 13l.7-4-2.9-2.8 4-.6L8 1.9Z"
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.35"
                    />
                  </svg>
                  收藏
                </button>
              </div>
            )}
          </div>

          {workflows.length > 0 && (
            <div style={workflowListHeader} aria-hidden="true">
              <span />
              <span>名称</span>
              <span>运行状态</span>
              <span>更新</span>
              <span>操作</span>
            </div>
          )}

          <div style={workflowList}>
            {initialLoading && (
              <div aria-label="正在加载工作流" style={loadingList}>
                {[0, 1, 2].map((item) => (
                  <div key={item} className="workbench-skeleton-row" />
                ))}
              </div>
            )}
            {workflowListEmpty && (
              <div style={emptyList} className="workbench-empty-state">
                <div style={emptyIntro}>
                  <span style={emptyIcon} aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      <path
                        d="M5 6.5h5M14 6.5h5M8.5 6.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm11 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 17.5h5m4 0h5M8.5 17.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm11 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 8.5v7"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </span>
                  <div>
                    <strong style={emptyTitle}>暂无工作流</strong>
                    <p style={emptyDescription}>
                      创建空白流程，或从销售、客服和审批场景快速开始。
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="打开画布"
                    onClick={createWorkflow}
                    style={emptyOpenCanvasButton}
                  >
                    打开画布
                  </button>
                </div>

                <div style={templateSection}>
                  <div style={templateHeading}>
                    <span>推荐业务场景</span>
                    <span style={templateHint}>创建后可自由修改</span>
                  </div>
                  <div style={templateGrid}>
                    {PUBLIC_WORKFLOW_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="workflow-template-card"
                        aria-label={`使用起步方案：${template.title}`}
                        onClick={() => createFromTemplate(template)}
                        style={templateCard}
                      >
                        <span
                          style={{
                            ...templateIcon,
                            color: template.accent,
                            background: `color-mix(in srgb, ${template.accent} 13%, transparent)`,
                          }}
                        >
                          <TemplateIcon kind={template.icon} />
                        </span>
                        <span style={templateBody}>
                          <span style={templateMeta}>{template.category}</span>
                          <strong style={templateTitle}>{template.title}</strong>
                          <span style={templateSummary}>{template.summary}</span>
                          <span style={templateOutcome}>{template.outcome}</span>
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                          focusable="false"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <path
                            d="m6 3 5 5-5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.4"
                          />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {filteredListEmpty && (
              <div style={emptyList}>
                <strong style={emptyTitle}>没有匹配的工作流</strong>
                <span>当前筛选下没有流程。调整状态、关键词或收藏条件。</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFavoritesOnly(false);
                    setFlowFilter("all");
                  }}
                  style={clearFilterButton}
                >
                  清除筛选
                </button>
              </div>
            )}

            {visibleFlows.map((flow) => {
              const workflow = flow.workflow;
              const favoriteLabel = workflow.isFavorite
                ? `取消收藏 ${workflow.title}`
                : `收藏 ${workflow.title}`;

              return (
              <div
                key={workflow.id}
                className="workbench-workflow-row"
                style={workflowRow}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    workflowId: workflow.id,
                  });
                }}
              >
                <button
                  type="button"
                  aria-label={favoriteLabel}
                  aria-pressed={workflow.isFavorite}
                  onClick={() => void toggleFavorite(workflow.id, workflow.isFavorite)}
                  style={favoriteButton}
                  title={favoriteLabel}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                    fill={workflow.isFavorite ? "currentColor" : "none"}
                  >
                    <path
                      d="m8 1.9 1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9L4.4 13l.7-4-2.9-2.8 4-.6L8 1.9Z"
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.35"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  aria-label={`打开 ${workflow.title}`}
                  onClick={() => openWorkflowOnCanvas(workflow.id)}
                  style={workflowInfoButton}
                >
                   <span style={rowTitleGroup}>
                    <strong style={rowTitle}>{workflow.title}</strong>
                    <span style={workflowState(workflow.status)}>
                      <span style={workflowStateDot(workflow.status)} />
                      {workflow.status === "published" ? "已发布" : "编辑中"}
                    </span>
                    </span>
                    <FlowRuntimeStatus flow={flow} />
                   <span style={rowMeta}>
                    更新于 {formatDate(workflow.updatedAt)}
                  </span>
                </button>

                <div style={rowActions}>
                  <Button
                    variant="ghost"
                    aria-label={`分享 ${workflow.title}`}
                    title="分享工作流"
                    onClick={() => shareWorkflow(workflow)}
                    style={shareRowButton}
                  >
                    <WorkflowMenuIcon kind="share" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => openWorkflowOnCanvas(workflow.id)}
                  >
                    打开
                  </Button>
                </div>
              </div>
            );
            })}
          </div>
        </section>
      </div>

      {contextMenu && contextWorkflow ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          ariaLabel={`${contextWorkflow.title} 操作`}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除工作流"
        description={deleteTarget ? `确定删除“${deleteTarget.title}”吗？删除后无法恢复。` : ""}
        confirmLabel="删除"
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (deleting) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDeleteWorkflow()}
      />

      <ShareWorkflowDialog
        open={shareTarget !== null}
        workflowId={shareTarget?.id ?? null}
        workflowTitle={shareTarget?.title ?? ""}
        onClose={() => setShareTarget(null)}
        onChanged={() => void load(workspaceKind)}
      />

    </div>
  );
}

function WorkflowMenuIcon({ kind }: { kind: "open" | "favorite" | "share" | "export" | "delete" }) {
  if (kind === "open") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 4.5h4l1.2 1.4h5.8v6.6h-11v-8Z" stroke="currentColor" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "favorite") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="m8 2 1.7 3.5 3.8.6-2.8 2.7.7 3.8L8 10.8l-3.4 1.8.7-3.8-2.8-2.7 3.8-.6L8 2Z" stroke="currentColor" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "share") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="4" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11.6" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11.6" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="m5.4 7.2 4.7-2.4M5.4 8.8l4.7 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "export") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2.5v7m0 0L5.3 6.8M8 9.5l2.7-2.7M3.5 11v1.5h9V11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 4.5h9M6 4.5V3h4v1.5m-5.5 0 .5 8h6l.5-8M6.8 6.5v4m2.4-4v4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TemplateIcon({
  kind,
}: {
  kind: WorkflowTemplate["icon"];
}) {
  if (kind === "users") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M7.4 9.4a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Zm5.8-.6a2.2 2.2 0 1 0 0-4.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.45"
        />
        <path
          d="M2.8 16.2c.6-2.5 2.2-4 4.6-4s4 1.5 4.6 4M12.6 12.4c2 .2 3.4 1.4 3.8 3.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.45"
        />
      </svg>
    );
  }

  if (kind === "headset") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M3.5 10v-1a6.5 6.5 0 0 1 13 0v1M5.5 9.5H4.3c-.8 0-1.3.6-1.3 1.4v2.4c0 .8.5 1.4 1.3 1.4h1.2V9.5Zm9 0h1.2c.8 0 1.3.6 1.3 1.4v2.4c0 .8-.5 1.4-1.3 1.4h-1.2V9.5Zm0 5.2c0 1.3-1.1 2.3-2.4 2.3H10"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.45"
        />
      </svg>
    );
  }

  if (kind === "clipboard-check") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M7 4.5H5.2c-.9 0-1.5.7-1.5 1.5v9.5c0 .9.6 1.5 1.5 1.5h9.6c.9 0 1.5-.6 1.5-1.5V6c0-.8-.6-1.5-1.5-1.5H13M7 3.8c0-.8.6-1.4 1.4-1.4h3.2c.8 0 1.4.6 1.4 1.4v1.4H7V3.8Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.45"
        />
        <path
          d="m7 11 1.8 1.8 4-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.45"
        />
      </svg>
    );
  }

  if (kind === "calendar") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M5.5 2.8v2.4m9-2.4v2.4M3.2 7h13.6M4.5 4.2h11c.9 0 1.5.7 1.5 1.5v9.2c0 .9-.6 1.5-1.5 1.5h-11c-.9 0-1.5-.6-1.5-1.5V5.7c0-.8.6-1.5 1.5-1.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.45"
        />
        <path d="M6.2 10h2v2h-2z" fill="currentColor" />
      </svg>
    );
  }

  if (kind === "branch") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M6 3.5v8.2c0 2.6 1.6 4.3 4.2 4.3h2.4M6 7h4.1c2.6 0 4.2-1.5 4.2-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <circle cx="6" cy="3.5" r="1.6" fill="currentColor" />
        <circle cx="14.4" cy="3" r="1.6" fill="currentColor" />
        <circle cx="14.4" cy="16" r="1.6" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="m10 2 1.3 4.4L15.5 8l-4.2 1.6L10 14l-1.3-4.4L4.5 8l4.2-1.6L10 2Zm5.2 10.5.6 1.9 1.7.6-1.7.7-.6 1.8-.7-1.8-1.8-.7 1.8-.6.7-1.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

const shell: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  background: "var(--bg-base)",
};

const frame: React.CSSProperties = {
  width: "100%",
  height: "100%",
  maxWidth: 1920,
  boxSizing: "border-box",
  margin: "0 auto",
  padding: "var(--space-5) clamp(var(--space-4), 2.5vw, var(--space-8))",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const launchHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "var(--space-3)",
  padding: "var(--space-1) 0 var(--space-3)",
};

const launchTitleBlock: React.CSSProperties = {
  flex: "1 1 240px",
  minWidth: 0,
  display: "grid",
  gap: 2,
};

const launchActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  flexWrap: "wrap",
  gap: "var(--space-2)",
};

const newWorkflowButton: React.CSSProperties = {
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-md)",
  background: "var(--accent)",
  color: "var(--text-inverse)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const publishedSection: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const publishedHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "var(--space-4)",
};

const sectionHeadingGroup: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 2,
};

const sectionDescription: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const listTools: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

const searchWrap: React.CSSProperties = {
  width: 220,
  height: 32,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "0 var(--space-2)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-muted)",
};

const searchInput: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  height: "100%",
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};

function filterButton(active: boolean): React.CSSProperties {
  return {
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    padding: "0 var(--space-2)",
    border: `1px solid ${active ? "var(--warning)" : "var(--border-subtle)"}`,
    borderRadius: "var(--radius-md)",
    background: active ? "var(--warning-subtle)" : "var(--bg-inset)",
    color: active ? "var(--warning)" : "var(--text-muted)",
    cursor: "pointer",
    fontSize: "var(--text-xs)",
    fontWeight: 650,
  };
}

const pageTitle: React.CSSProperties = {
  margin: 0,
  color: "var(--text-primary)",
  fontSize: "var(--text-xl)",
};

const pageSubtitle: React.CSSProperties = {
  margin: "var(--space-1) 0 0",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: "var(--text-primary)",
  fontSize: "var(--text-lg)",
};

const refreshButton: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-primary)",
  cursor: "pointer",
  flexShrink: 0,
};

const workflowList: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "grid",
  alignContent: "start",
  gap: "var(--space-2)",
};

const workflowListHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "28px minmax(280px, 1.5fr) minmax(210px, 0.75fr) minmax(140px, 0.45fr) 112px",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "0 var(--space-3)",
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const workflowRow: React.CSSProperties = {
  minHeight: 76,
  display: "grid",
  gridTemplateColumns:
    "28px minmax(280px, 1.5fr) minmax(210px, 0.75fr) minmax(140px, 0.45fr) 112px",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-surface)",
};

const workflowInfoButton: React.CSSProperties = {
  gridColumn: "2 / span 3",
  minWidth: 0,
  display: "grid",
  gridTemplateColumns:
    "minmax(280px, 1.5fr) minmax(210px, 0.75fr) minmax(140px, 0.45fr)",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: 0,
  border: "none",
  textAlign: "left",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};

const rowTitle: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
  fontSize: "var(--text-md)",
};

const rowTitleGroup: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

function workflowState(status: string): React.CSSProperties {
  const ready = status === "published";
  return {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    padding: "2px 7px",
    border: `1px solid ${ready ? "var(--success)" : "var(--border-strong)"}`,
    borderRadius: "var(--radius-full)",
    background: ready ? "var(--success-subtle)" : "var(--bg-inset)",
    color: ready ? "var(--success)" : "var(--text-muted)",
    fontSize: "var(--text-xs)",
    fontWeight: 650,
  };
}

function workflowStateDot(status: string): React.CSSProperties {
  return {
    width: 5,
    height: 5,
    borderRadius: "var(--radius-full)",
    background:
      status === "published" ? "var(--success)" : "var(--text-disabled)",
  };
}

const rowMeta: React.CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const favoriteButton: React.CSSProperties = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: "var(--warning)",
  cursor: "pointer",
  padding: 0,
  borderRadius: "var(--radius-sm)",
  lineHeight: 0,
};

const rowActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
};

const shareRowButton: React.CSSProperties = {
  width: 32,
  height: 30,
  display: "grid",
  placeItems: "center",
  padding: 0,
  color: "var(--text-secondary)",
};

const emptyList: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-3)",
  padding: "var(--space-4)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.6,
};

const loadingList: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-2)",
};

const emptyIntro: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "var(--space-3)",
};

const emptyIcon: React.CSSProperties = {
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-lg)",
  background: "var(--accent-subtle)",
  color: "var(--accent)",
};

const emptyTitle: React.CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: "var(--text-md)",
};

const emptyDescription: React.CSSProperties = {
  margin: "var(--space-1) 0 0",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
};

const emptyOpenCanvasButton: React.CSSProperties = {
  height: 34,
  padding: "0 var(--space-3)",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-md)",
  background: "var(--accent-subtle)",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const templateSection: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-3)",
  paddingTop: "var(--space-4)",
  borderTop: "1px solid var(--border-subtle)",
};

const templateHeading: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
  fontWeight: 650,
};

const templateHint: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  fontWeight: 500,
};

const templateGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "var(--space-2)",
};

const templateCard: React.CSSProperties = {
  minHeight: 152,
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr) auto",
  alignItems: "start",
  gap: "var(--space-3)",
  padding: "var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-inset)",
  color: "var(--text-primary)",
  cursor: "pointer",
  textAlign: "left",
};

const templateIcon: React.CSSProperties = {
  width: 36,
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-md)",
};

const templateBody: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "var(--space-1)",
};

const templateMeta: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const templateTitle: React.CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
};

const templateSummary: React.CSSProperties = {
  minHeight: 38,
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.55,
};

const templateOutcome: React.CSSProperties = {
  marginTop: "var(--space-1)",
  color: "var(--accent)",
  fontSize: "var(--text-xs)",
  fontWeight: 650,
};

const clearFilterButton: React.CSSProperties = {
  justifySelf: "start",
  height: 32,
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
};

const retryButton: React.CSSProperties = {
  flexShrink: 0,
  height: 28,
  padding: "0 var(--space-2)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--danger)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  fontWeight: 650,
};

const errorBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--danger-subtle)",
  color: "var(--danger)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)",
};
