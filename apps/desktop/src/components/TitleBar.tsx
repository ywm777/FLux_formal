import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette, carrierColorVar, type CommandItem } from "@flux/ui";
import { EXECUTION_STATUS, type ExecutionStatus } from "@flux/shared";
import {
  isTauriEnv,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
  onWindowResized,
} from "../lib/windowControls.js";
import { useAppStore, type AppMode } from "../store/appStore.js";
import { useAuthStore } from "../store/authStore.js";
import { useCanvasStore } from "../store/canvasStore.js";
import { BrandMark } from "./BrandMark.js";
import { catalogNodes } from "../lib/registry.js";
import { getNodeDefinitionSummary } from "../lib/nodeDisplay.js";
import {
  isEditableShortcutTarget,
  matchesShortcut,
  shortcutLabel,
} from "../lib/keyboardShortcuts.js";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog.js";
import { useAiConnectionsStore } from "../store/aiConnectionsStore.js";
import { getExecutionStatusLabel } from "../lib/executionDisplay.js";
import { AccountSettingsDialog } from "../features/auth/AccountSettingsDialog.js";
import { useWorkspaceStore, type WorkspaceKind } from "../store/workspaceStore.js";
import { useWorkflowCommands } from "../app/WorkflowCommandProvider.js";

const BAR_HEIGHT = 40;
const PRIMARY_NAV: { mode: AppMode; label: string }[] = [
  { mode: "workbench", label: "工作台" },
  { mode: "canvas", label: "画布" },
];

export function TitleBar({ sharedView = false }: { sharedView?: boolean }) {
  const workflowCommands = useWorkflowCommands();
  const [maximized, setMaximized] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const workflowMenuRef = useRef<HTMLDivElement | null>(null);
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const workspaceKind = useWorkspaceStore((s) => s.kind);
  const setWorkspaceKind = useWorkspaceStore((s) => s.setKind);
  const requestCloudAccess = useWorkspaceStore((s) => s.requestCloudAccess);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const openAiAccess = useAppStore((s) => s.openAiAccess);
  const closeAiAccess = useAppStore((s) => s.closeAiAccess);
  const aiConnections = useAiConnectionsStore((s) => s.connections);
  const aiConnectionsStatus = useAiConnectionsStore((s) => s.loadStatus);
  const loadAiConnections = useAiConnectionsStore((s) => s.load);
  const publishing = useCanvasStore((s) => s.publishing);
  const sharing = useCanvasStore((s) => s.sharing);
  const testing = useCanvasStore((s) => s.testing);
  const runProgress = useCanvasStore((s) => s.runProgress);
  const saving = useCanvasStore((s) => s.status === "saving");
  const canvasName = useCanvasStore((s) => s.title);
  const requestPublish = useCanvasStore((s) => s.requestPublish);
  const requestShare = useCanvasStore((s) => s.requestShare);
  const requestTestRun = useCanvasStore((s) => s.requestTestRun);
  const requestAddNode = useCanvasStore((s) => s.requestAddNode);
  const requestInsertNodeType = useCanvasStore((s) => s.requestInsertNodeType);
  const requestRenameWorkflow = useCanvasStore((s) => s.requestRenameWorkflow);
  const requestNewWorkflow = useCanvasStore((s) => s.requestNewWorkflow);
  const authed = authStatus === "authenticated";
  const displayName = authed ? user?.displayName ?? "未命名用户" : "本地空间";
  const accountIdentity = authed
    ? user?.identities.find((identity) => identity.channel === "email")?.externalId ?? user?.id ?? "云端账户"
    : "数据仅保存在此设备";
  const initial = authed
    ? (user?.displayName ?? "云").charAt(0).toUpperCase()
    : "本";
  const testRunDisabled = testing || saving || publishing || sharing;
  const saveDisabled = saving || testing || publishing || sharing;
  const publishDisabled = publishing || saving || testing || sharing;
  const shareDisabled = sharing || saving || testing || publishing;
  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "new-workflow",
        label: "新建工作流",
        description: "打开空白画布",
        group: "工作台",
        keywords: ["new", "workflow", "canvas"],
        shortcut: mode === "workbench" ? shortcutLabel("new-workflow") : undefined,
      },
      {
        id: "open-canvas",
        label: "打开画布",
        description: "进入无界画布",
        group: "导航",
        keywords: ["canvas"],
        shortcut: shortcutLabel("open-canvas"),
      },
      {
        id: "open-workbench",
        label: "进入工作台",
        description: "查看工作流",
        group: "导航",
        keywords: ["workbench"],
        shortcut: shortcutLabel("open-workbench"),
      },
      {
        id: "account-settings",
        label: "账户设置",
        description: "管理个人资料和登录安全",
        group: "账户",
        keywords: ["account", "profile", "password", "账户", "密码"],
      },
      {
        id: "ai-access",
        label: "AI 接入",
        description: "连接和管理模型服务",
        group: "账户",
        keywords: ["ai", "model", "provider", "ollama", "openai", "模型"],
      },
      {
        id: "keyboard-shortcuts",
        label: "键盘快捷键",
        description: `查看全部快捷键（${shortcutLabel("shortcut-help")}）`,
        group: "帮助",
        keywords: ["keyboard", "shortcut", "hotkey", "help"],
        shortcut: shortcutLabel("shortcut-help"),
      },
    ];

    if (mode === "canvas") {
      items.push(
        {
          id: "add-node",
          label: "添加节点",
          description: "在画布中添加能力",
          group: "画布",
          keywords: ["node", "add"],
          shortcut: shortcutLabel("add-node"),
        },
        {
          id: "rename-workflow",
          label: "重命名工作流",
          description: "修改当前画布名称",
          group: "画布",
          keywords: ["rename", "title"],
        },
        {
          id: "test-run",
          label: testing ? "工作流执行中" : "执行工作流",
          description: "保存并执行当前画布",
          group: "画布",
          keywords: ["run", "preview"],
          shortcut: shortcutLabel("run-preview"),
        },
        {
          id: "save",
          label: saving ? "保存中" : "保存工作流",
          description: workspaceKind === "local" ? "立即保存到此设备" : "立即保存当前画布",
          group: "画布",
          keywords: ["save", "保存"],
          shortcut: shortcutLabel("save-workflow"),
        },
        {
          id: "publish",
          label: publishing ? "发布中" : "发布工作流",
          description: "发布当前画布",
          group: "画布",
          keywords: ["publish"],
        },
        {
          id: "share",
          label: sharing ? "正在准备分享" : "分享工作流",
          description: "创建可撤销的只读链接",
          group: "画布",
          keywords: ["share", "link", "分享", "链接"],
        },
        ...catalogNodes.map((def): CommandItem => ({
          id: `node:${def.id}`,
          label: def.name,
          description: getNodeDefinitionSummary(def),
          group: "能力",
          keywords: [def.id, def.category, def.carrier],
          accent: carrierColorVar[def.carrier as keyof typeof carrierColorVar],
        })),
      );
    }

    return items.filter((item) => {
      if ((item.id === "account-settings" || item.id === "ai-access") && !authed) {
        return false;
      }
      if (item.id === "publish" && workspaceKind !== "cloud") return false;
      return true;
    });
  }, [authed, mode, publishing, saving, sharing, testing, workspaceKind]);

  function onCommandSelect(item: CommandItem) {
    if (item.id.startsWith("node:")) {
      requestInsertNodeType(item.id.slice("node:".length));
      return;
    }

    switch (item.id) {
      case "new-workflow":
        requestNewWorkflow();
        setMode("canvas");
        break;
      case "add-node":
        requestAddNode();
        break;
      case "rename-workflow":
        requestRenameWorkflow();
        break;
      case "test-run":
        if (!testRunDisabled) requestTestRun();
        break;
      case "save":
        if (!saveDisabled) void workflowCommands.save();
        break;
      case "publish":
        if (!publishDisabled) requestPublish();
        break;
      case "share":
        if (!shareDisabled) requestShare();
        break;
      case "open-canvas":
        setMode("canvas");
        break;
      case "open-workbench":
        setMode("workbench");
        break;
      case "ai-access":
        showAiAccess();
        break;
      case "account-settings":
        showAccountSettings();
        break;
      case "keyboard-shortcuts":
        setShortcutHelpOpen(true);
        break;
    }
  }

  const closeShortcutHelp = useCallback(() => setShortcutHelpOpen(false), []);
  const showAiAccess = useCallback(() => {
    if (!authed) {
      requestCloudAccess("switch");
      return;
    }
    setAccountMenuOpen(false);
    setWorkflowMenuOpen(false);
    setAccountSettingsOpen(false);
    setCommandOpen(false);
    setShortcutHelpOpen(false);
    openAiAccess();
  }, [authed, openAiAccess, requestCloudAccess]);
  const showAccountSettings = useCallback(() => {
    if (!authed) {
      requestCloudAccess("switch");
      return;
    }
    setAccountMenuOpen(false);
    setWorkflowMenuOpen(false);
    setCommandOpen(false);
    setShortcutHelpOpen(false);
    closeAiAccess();
    setAccountSettingsOpen(true);
  }, [authed, closeAiAccess, requestCloudAccess]);
  const closeAccountSettings = useCallback(
    () => setAccountSettingsOpen(false),
    [],
  );
  const switchWorkspace = useCallback(async (kind: WorkspaceKind) => {
    setAccountMenuOpen(false);
    setAccountSettingsOpen(false);
    setCommandOpen(false);
    closeAiAccess();
    useCanvasStore.getState().reset();
    setMode("workbench");
    await setWorkspaceKind(kind);
  }, [closeAiAccess, setMode, setWorkspaceKind]);

  useEffect(() => {
    if (!isTauriEnv) return;
    let unlisten: (() => void) | undefined;
    let active = true;
    void isWindowMaximized().then((m) => active && setMaximized(m));
    void onWindowResized(async () => {
      const m = await isWindowMaximized();
      if (active) setMaximized(m);
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;

    if (authed) void loadAiConnections();

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target)
      ) {
        setAccountMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen, authed, loadAiConnections]);

  useEffect(() => {
    if (!workflowMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        workflowMenuRef.current &&
        !workflowMenuRef.current.contains(target)
      ) {
        setWorkflowMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setWorkflowMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [workflowMenuOpen]);

  useEffect(() => {
    if (sharedView) return;

    function onKeyDown(event: KeyboardEvent) {
      if (matchesShortcut(event, "command-palette")) {
        event.preventDefault();
        setShortcutHelpOpen(false);
        setWorkflowMenuOpen(false);
        setCommandOpen(true);
        return;
      }

      if (matchesShortcut(event, "shortcut-help")) {
        event.preventDefault();
        setCommandOpen(false);
        setAccountMenuOpen(false);
        setWorkflowMenuOpen(false);
        setShortcutHelpOpen(true);
        return;
      }

      if (isEditableShortcutTarget(event.target)) return;

      if (matchesShortcut(event, "open-workbench")) {
        event.preventDefault();
        setCommandOpen(false);
        setShortcutHelpOpen(false);
        setMode("workbench");
        return;
      }

      if (matchesShortcut(event, "open-canvas")) {
        event.preventDefault();
        setCommandOpen(false);
        setShortcutHelpOpen(false);
        setMode("canvas");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setMode, sharedView]);

  return (
    <div
      data-tauri-drag-region
      style={{
        height: BAR_HEIGHT,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        paddingLeft: "var(--space-3)",
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-subtle)",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <BrandMark />
      <span
        data-tauri-drag-region
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          letterSpacing: 0,
          color: "var(--text-primary)",
        }}
      >
        Flux
      </span>
      <span
        data-tauri-drag-region
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {sharedView ? "共享流程" : "无界工作流"}
      </span>

      {!sharedView && (
        <nav role="tablist" aria-label="主导航" style={primaryNav}>
          {PRIMARY_NAV.map((item) => {
            const active = mode === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                role="tab"
                aria-selected={active}
                aria-keyshortcuts={item.mode === "workbench" ? "Control+1 Meta+1" : "Control+2 Meta+2"}
                title={`${item.label} (${shortcutLabel(item.mode === "workbench" ? "open-workbench" : "open-canvas")})`}
                onClick={() => setMode(item.mode)}
                style={primaryNavButton(active)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}

      {!sharedView && mode === "canvas" && (
        <button
          type="button"
          className="titlebar-canvas-name"
          aria-label={`重命名工作流：${canvasName}`}
          title="重命名工作流"
          onClick={() => requestRenameWorkflow()}
          style={canvasNameButton}
        >
          <span style={canvasNameText}>{canvasName}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3.2 11.7 3 13l1.3-.2 6.8-6.8-1.1-1.1-6.8 6.8Zm6.5-7.1.8-.8c.4-.4 1-.4 1.4 0l.3.3c.4.4.4 1 0 1.4l-.8.8"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.35"
            />
          </svg>
        </button>
      )}

      <div data-tauri-drag-region style={titlebarCenterZone}>
        {!sharedView && (
          mode === "canvas" && runProgress ? (
            <div
              className="titlebar-run-progress"
              role="status"
              aria-live="polite"
              aria-label={`运行进度：${getExecutionStatusLabel(runProgress.status)}，${runProgress.completed}/${runProgress.total}，${runProgress.activeLabel}`}
              title={`${getExecutionStatusLabel(runProgress.status)} · ${runProgress.completed}/${runProgress.total} · ${runProgress.activeLabel}`}
              style={titlebarRunProgress}
            >
              <span
                aria-hidden="true"
                style={{
                  ...titlebarRunStatusDot,
                  background: runStatusColor(runProgress.status),
                }}
              />
              <span style={titlebarRunStatusLabel}>
                {getExecutionStatusLabel(runProgress.status)}
              </span>
              <strong style={titlebarRunProgressCount}>
                {runProgress.completed}/{runProgress.total}
              </strong>
              <span aria-hidden="true" style={titlebarRunDivider}>·</span>
              <span style={titlebarRunActiveLabel}>{runProgress.activeLabel}</span>
            </div>
          ) : (
            <button
              type="button"
              className="titlebar-command-trigger"
              aria-label="打开命令面板"
              aria-keyshortcuts="Control+K Meta+K"
              title={`命令面板 (${shortcutLabel("command-palette")})`}
              onClick={() => {
                setShortcutHelpOpen(false);
                setWorkflowMenuOpen(false);
                setAccountMenuOpen(false);
                setCommandOpen(true);
              }}
              style={commandTriggerButton}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M7.1 11.2A4.1 4.1 0 1 1 7.1 3a4.1 4.1 0 0 1 0 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="m10.4 10.4 2.7 2.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
              </svg>
              <span>搜索命令</span>
            </button>
          )
        )}
      </div>

      {!sharedView && (
        <div style={titlebarActions}>
          {mode === "canvas" && (
            <>
              <div style={workflowActionGroup}>
                <button
                  type="button"
                  className="titlebar-primary-action"
                  aria-label={testing ? "工作流执行中" : "执行工作流"}
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  onClick={() => requestTestRun()}
                  disabled={testRunDisabled}
                  title={`执行工作流 (${shortcutLabel("run-preview")})`}
                  style={{
                    ...workflowPrimaryButton,
                    cursor: testRunDisabled ? "not-allowed" : "pointer",
                    opacity: testRunDisabled ? 0.6 : 1,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" />
                  </svg>
                  <span>{testing ? "运行中" : "运行"}</span>
                </button>

                {workspaceKind === "local" ? (
                  <button
                    type="button"
                    className="titlebar-secondary-action"
                    aria-label={saving ? "正在保存工作流" : "保存工作流"}
                    aria-keyshortcuts="Control+S Meta+S"
                    onClick={() => void workflowCommands.save()}
                    disabled={saveDisabled}
                    title={`保存工作流 (${shortcutLabel("save-workflow")})`}
                    style={{
                      ...workflowSecondaryButton,
                      cursor: saveDisabled ? "not-allowed" : "pointer",
                      opacity: saveDisabled ? 0.6 : 1,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M3 2.5h7.5L13 5v8.5H3v-11Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.25" />
                      <path d="M5 2.5V6h5V2.5M5.2 13.5V9.4h5.6v4.1" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.25" />
                    </svg>
                    <span>{saving ? "保存中" : "保存"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="titlebar-secondary-action"
                    aria-label={publishing ? "发布中" : "发布工作流"}
                    onClick={() => requestPublish()}
                    disabled={publishDisabled}
                    title="发布工作流"
                    style={{
                      ...workflowSecondaryButton,
                      cursor: publishDisabled ? "not-allowed" : "pointer",
                      opacity: publishDisabled ? 0.6 : 1,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M8 2.5 4.8 5.7M8 2.5l3.2 3.2M8 2.5v8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                      <path d="M3.5 10.5v1.8c0 .7.5 1.2 1.2 1.2h6.6c.7 0 1.2-.5 1.2-1.2v-1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                    </svg>
                    <span>{publishing ? "发布中" : "发布"}</span>
                  </button>
                )}
              </div>

              <div ref={workflowMenuRef} style={workflowMenuWrap}>
                <button
                  type="button"
                  className="titlebar-tool-button"
                  aria-label="更多工作流操作"
                  aria-haspopup="menu"
                  aria-expanded={workflowMenuOpen}
                  title="更多操作"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setWorkflowMenuOpen((open) => !open);
                  }}
                  style={commandButton}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <circle cx="3.2" cy="8" r="1.1" fill="currentColor" />
                    <circle cx="8" cy="8" r="1.1" fill="currentColor" />
                    <circle cx="12.8" cy="8" r="1.1" fill="currentColor" />
                  </svg>
                </button>

                {workflowMenuOpen && (
                  <div role="menu" aria-label="工作流操作" className="titlebar-workflow-menu" style={workflowMenu}>
                    <button
                      type="button"
                      role="menuitem"
                      className="titlebar-workflow-menu-item"
                      disabled={shareDisabled}
                      onClick={() => {
                        setWorkflowMenuOpen(false);
                        requestShare();
                      }}
                      style={workflowMenuItem}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <circle cx="4" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
                        <circle cx="11.7" cy="4" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
                        <circle cx="11.7" cy="12" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
                        <path d="m5.5 7.2 4.7-2.4M5.5 8.8l4.7 2.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
                      </svg>
                      <span>{sharing ? "正在准备分享" : "分享工作流"}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="titlebar-workflow-menu-item"
                      onClick={() => {
                        setWorkflowMenuOpen(false);
                        setCommandOpen(false);
                        setShortcutHelpOpen(true);
                      }}
                      style={workflowMenuItem}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <rect x="2" y="3.2" width="12" height="9.6" rx="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
                        <path d="M4.3 6h1.2m1.5 0h1.2m1.5 0h1.2M4.3 8.5h1.2m1.5 0h1.2m1.5 0h1.2M5.7 11h4.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.15" />
                      </svg>
                      <span>键盘快捷键</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <div ref={accountMenuRef} style={accountMenuWrap}>
            <button
              id="account-menu-trigger"
              type="button"
              aria-label="打开空间菜单"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              title={workspaceKind === "local" ? "本地空间" : "云端空间"}
              onClick={() => {
                setWorkflowMenuOpen(false);
                setAccountMenuOpen((open) => !open);
              }}
              style={avatarButton}
            >
              {initial}
            </button>

            {accountMenuOpen && (
              <div
                role="menu"
                aria-label="空间菜单"
                className="account-menu-panel"
                style={accountMenu}
              >
                <div style={accountHeader}>
                  <span style={accountEyebrow}>空间</span>
                  <strong style={accountName}>{displayName}</strong>
                  <span style={accountIdentityText}>{accountIdentity}</span>
                </div>

                <div style={accountSection}>
                  <span style={accountSectionLabel}>当前空间</span>
                  <strong style={accountSectionValue}>
                    {workspaceKind === "local" ? "本地空间" : "云端空间"}
                  </strong>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  aria-label={workspaceKind === "local" ? "切换到云端空间" : "切换到本地空间"}
                  onClick={() => {
                    if (workspaceKind === "cloud") {
                      void switchWorkspace("local");
                    } else if (authed) {
                      void switchWorkspace("cloud");
                    } else {
                      setAccountMenuOpen(false);
                      requestCloudAccess("switch");
                    }
                  }}
                  style={accountMenuItem}
                >
                  {workspaceKind === "local" ? "切换到云端空间" : "切换到本地空间"}
                </button>

                {authed && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      aria-label="账户设置"
                      onClick={showAccountSettings}
                      style={accountMenuItem}
                    >
                      账户设置
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      aria-label="AI 接入"
                      onClick={showAiAccess}
                      style={{ ...accountMenuItem, justifyContent: "space-between" }}
                    >
                      <span>AI 接入</span>
                      <span style={accountMenuStatus}>
                        {aiConnectionsStatus === "loading"
                          ? "读取中"
                          : aiConnections.filter((item) => item.status === "connected").length > 0
                            ? `${aiConnections.filter((item) => item.status === "connected").length} 个可用`
                            : aiConnections.length > 0
                              ? "需检查"
                              : "未配置"}
                      </span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  role="menuitem"
                  aria-label="工作台"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setMode("workbench");
                  }}
                  style={accountMenuItem}
                >
                  工作台
                </button>

                <button
                  type="button"
                  role="menuitem"
                  aria-label="画布"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setMode("canvas");
                  }}
                  style={accountMenuItem}
                >
                  画布
                </button>

                {authed && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void switchWorkspace("local").then(() => logout());
                    }}
                    style={{ ...accountMenuItem, color: "var(--danger)" }}
                  >
                    退出登录
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {authed && !sharedView && (
        <AccountSettingsDialog
          open={accountSettingsOpen}
          onClose={closeAccountSettings}
        />
      )}

      {!sharedView && (
        <CommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          items={commandItems}
          onSelect={onCommandSelect}
          placeholder="搜索命令、能力或页面"
        />
      )}

      {!sharedView && (
        <KeyboardShortcutsDialog
          open={shortcutHelpOpen}
          activeMode={mode}
          onClose={closeShortcutHelp}
        />
      )}

      {isTauriEnv && (
        <div style={{ display: "flex", height: "100%" }}>
          <ControlButton label="最小化" onClick={() => void minimizeWindow()}>
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <rect x="1" y="5" width="9" height="1" fill="currentColor" />
            </svg>
          </ControlButton>
          <ControlButton
            label={maximized ? "向下还原" : "最大化"}
            onClick={() => void toggleMaximizeWindow()}
          >
            {maximized ? (
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                <rect
                  x="1.5"
                  y="3"
                  width="6"
                  height="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <path
                  d="M3.5 3V1.5H9.5V7.5H8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                <rect
                  x="1.5"
                  y="1.5"
                  width="8"
                  height="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </ControlButton>
          <ControlButton
            label="关闭"
            danger
            onClick={() => void closeWindow()}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <path
                d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </ControlButton>
        </div>
      )}
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 46,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: hover
          ? danger
            ? "var(--danger)"
            : "var(--bg-inset)"
          : "transparent",
        color: hover && danger ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        transition: "background var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard)",
      }}
    >
      {children}
    </button>
  );
}

const accountMenuWrap: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  marginLeft: "var(--space-1)",
};

const titlebarCenterZone: React.CSSProperties = {
  minWidth: 100,
  height: "100%",
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 var(--space-4)",
};

const commandTriggerButton: React.CSSProperties = {
  width: "min(240px, 100%)",
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "var(--space-2)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  fontWeight: 550,
  transition: "border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
};

const titlebarActions: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  paddingRight: "var(--space-2)",
};

const workflowActionGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-1)",
};

const workflowPrimaryButton: React.CSSProperties = {
  height: 28,
  minWidth: 58,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-1)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-md)",
  background: "var(--accent-subtle)",
  color: "var(--accent)",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  whiteSpace: "nowrap",
  transition: "border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
};

const workflowSecondaryButton: React.CSSProperties = {
  height: 28,
  minWidth: 58,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-1)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: "var(--text-xs)",
  fontWeight: 650,
  whiteSpace: "nowrap",
  transition: "border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
};

const workflowMenuWrap: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  marginLeft: "var(--space-1)",
  paddingLeft: "var(--space-3)",
  borderLeft: "1px solid var(--border-subtle)",
};

const workflowMenu: React.CSSProperties = {
  position: "absolute",
  top: 34,
  right: 0,
  zIndex: "var(--z-popover)" as unknown as number,
  width: 184,
  padding: "var(--space-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-popover)",
};

const workflowMenuItem: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "0 var(--space-2)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  textAlign: "left",
  transition: "color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
};

const primaryNav: React.CSSProperties = {
  height: 28,
  display: "flex",
  alignItems: "center",
  gap: 2,
  marginLeft: "var(--space-3)",
  padding: 2,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
};

function primaryNavButton(active: boolean): React.CSSProperties {
  return {
    minWidth: 48,
    height: 22,
    padding: "0 var(--space-2)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: active ? "var(--accent-subtle)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-muted)",
    cursor: "pointer",
    fontSize: "var(--text-xs)",
    fontWeight: active ? 700 : 600,
    whiteSpace: "nowrap",
    lineHeight: "22px",
  };
}

const avatarButton: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: "var(--radius-full)",
  background: "var(--accent-subtle)",
  color: "var(--accent)",
  border: "1px solid transparent",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  flexShrink: 0,
};

const commandButton: React.CSSProperties = {
  width: 28,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  transition: "border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
};

const canvasNameButton: React.CSSProperties = {
  maxWidth: 260,
  height: 26,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-1)",
  marginLeft: "var(--space-2)",
  padding: "0 var(--space-2)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  transition: "border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
};

const canvasNameText: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const accountMenu: React.CSSProperties = {
  position: "absolute",
  top: 34,
  right: 0,
  width: 180,
  zIndex: "var(--z-popover)" as unknown as number,
  padding: "var(--space-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-popover)",
};

const accountHeader: React.CSSProperties = {
  display: "grid",
  gap: 3,
  padding: "var(--space-2) var(--space-2) var(--space-3)",
  borderBottom: "1px solid var(--border-subtle)",
};

const accountEyebrow: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const accountName: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
};

const accountIdentityText: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const accountSection: React.CSSProperties = {
  display: "grid",
  gap: 2,
  padding: "var(--space-3) var(--space-2)",
  borderBottom: "1px solid var(--border-subtle)",
};

const accountSectionLabel: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const accountSectionValue: React.CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
  fontWeight: 650,
};

const accountMenuItem: React.CSSProperties = {
  width: "100%",
  minHeight: 30,
  display: "flex",
  alignItems: "center",
  padding: "0 var(--space-2)",
  marginTop: "var(--space-1)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  textAlign: "left",
};

function runStatusColor(status: ExecutionStatus): string {
  switch (status) {
    case EXECUTION_STATUS.SUCCESS:
      return "var(--success)";
    case EXECUTION_STATUS.FAILED:
    case EXECUTION_STATUS.CANCELLED:
      return "var(--danger)";
    case EXECUTION_STATUS.PAUSED:
      return "var(--warning)";
    default:
      return "var(--accent)";
  }
}

const titlebarRunProgress: React.CSSProperties = {
  minWidth: 0,
  maxWidth: 220,
  height: 26,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-1)",
  padding: "0 var(--space-2)",
  borderLeft: "1px solid var(--border-subtle)",
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const titlebarRunStatusDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "var(--radius-full)",
  flexShrink: 0,
};

const titlebarRunStatusLabel: React.CSSProperties = {
  flexShrink: 0,
};

const titlebarRunProgressCount: React.CSSProperties = {
  color: "var(--text-primary)",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const titlebarRunDivider: React.CSSProperties = {
  color: "var(--text-disabled)",
  flexShrink: 0,
};

const titlebarRunActiveLabel: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const accountMenuStatus: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  fontWeight: 500,
};
