import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Input, Select } from "@flux/ui";
import { formatProductErrorMessage } from "../../lib/productError.js";
import {
  createMcpJsonTemplate,
  mcpDraftToJson,
  parseMcpConnectionJson,
  type McpConnection,
  type McpConnectionDraft,
} from "../../lib/capabilities/mcpConnection.js";
import { BrandMark } from "../../components/BrandMark.js";
import { useAppStore } from "../../store/appStore.js";
import {
  closeWindow,
  isTauriEnv,
  minimizeWindow,
  toggleMaximizeWindow,
} from "../../lib/windowControls.js";
import {
  createMcpConnectionDraft,
  useMcpConnectionStore,
} from "./store/mcpConnectionStore.js";

export interface McpSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function McpSettingsDialog({
  open,
  onClose,
}: McpSettingsDialogProps) {
  const connections = useMcpConnectionStore((state) => state.connections);
  const storeError = useMcpConnectionStore((state) => state.error);
  const notice = useMcpConnectionStore((state) => state.notice);
  const connect = useMcpConnectionStore((state) => state.connect);
  const setConnectionEnabled = useMcpConnectionStore((state) => state.setEnabled);
  const remove = useMcpConnectionStore((state) => state.remove);
  const hasSessionToken = useMcpConnectionStore((state) => state.hasSessionToken);
  const clearFeedback = useMcpConnectionStore((state) => state.clearFeedback);
  const setMode = useAppStore((state) => state.setMode);
  const [draft, setDraft] = useState<McpConnectionDraft>(() => createMcpConnectionDraft());
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"json" | "form">("form");
  const [jsonText, setJsonText] = useState(() => createMcpJsonTemplate());
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);

  const editing = useMemo(
    () => connections.find((connection) => connection.id === draft.id),
    [connections, draft.id],
  );

  const filteredConnections = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return connections;
    return connections.filter((connection) => [
      connection.name,
      connection.serverName,
      connection.serverUrl,
      connection.command,
      ...connection.args,
      ...connection.operations.flatMap((operation) => [operation.title, operation.externalName]),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)));
  }, [connections, query]);

  useEffect(() => {
    if (!open) return;
    clearFeedback();
    setLocalError(null);
    setEditingOpen(false);
    setEditorMode("form");
    setJsonText(createMcpJsonTemplate());
    setQuery("");
    setDraft(createMcpConnectionDraft());
    setToken("");
  }, [clearFeedback, open]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    requestAnimationFrame(() => closeRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        if (editingOpen) {
          setEditingOpen(false);
        } else {
          onClose();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [editingOpen, onClose, open]);

  function startNew(mode: "json" | "form" = "form") {
    clearFeedback();
    const nextDraft = createMcpConnectionDraft();
    setDraft(nextDraft);
    setJsonText(createMcpJsonTemplate());
    setEditorMode(mode);
    setToken("");
    setLocalError(null);
    setEditingOpen(true);
  }

  function edit(connection: McpConnection) {
    clearFeedback();
    const nextDraft: McpConnectionDraft = {
      id: connection.id,
      name: connection.name,
      transport: connection.transport,
      enabled: connection.enabled,
      serverUrl: connection.serverUrl,
      authentication: connection.authentication,
      command: connection.command,
      argsText: connection.args.join("\n"),
      cwd: connection.cwd ?? "",
      environmentText: Object.entries(connection.environment)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    };
    setDraft(nextDraft);
    setJsonText(mcpDraftToJson(nextDraft));
    setEditorMode("form");
    setToken("");
    setLocalError(null);
    setEditingOpen(true);
  }

  async function submit() {
    setBusy(true);
    setLocalError(null);
    try {
      const parsed = editorMode === "json" ? parseMcpConnectionJson(jsonText, draft.id) : null;
      const submittedDraft = parsed?.draft ?? draft;
      const submittedToken = parsed?.token || token;
      const connection = await connect(submittedDraft, submittedToken);
      const nextDraft: McpConnectionDraft = {
        id: connection.id,
        name: connection.name,
        transport: connection.transport,
        enabled: connection.enabled,
        serverUrl: connection.serverUrl,
        authentication: connection.authentication,
        command: connection.command,
        argsText: connection.args.join("\n"),
        cwd: connection.cwd ?? "",
        environmentText: Object.entries(connection.environment)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
      };
      setDraft(nextDraft);
      setJsonText(mcpDraftToJson(nextDraft));
      setToken("");
      setEditingOpen(false);
    } catch (error) {
      setLocalError(formatProductErrorMessage(error, "连接没有完成。"));
    } finally {
      setBusy(false);
    }
  }

  function selectEditorMode(mode: "json" | "form") {
    if (mode === editorMode) return;
    setLocalError(null);
    if (mode === "form") {
      try {
        const parsed = parseMcpConnectionJson(jsonText, draft.id);
        setDraft(parsed.draft);
        setToken(parsed.token);
      } catch (error) {
        setLocalError(formatProductErrorMessage(error, "JSON 配置无法转换为表单。"));
        return;
      }
    } else {
      setJsonText(mcpDraftToJson(draft));
    }
    setEditorMode(mode);
  }

  async function removeConnection(connection: McpConnection) {
    if (!window.confirm(`移除“${connection.name}”？使用这些能力的节点将无法继续运行。`)) return;
    await remove(connection.id);
    if (draft.id === connection.id) {
      setDraft(createMcpConnectionDraft());
      setToken("");
    }
  }

  function goToCanvas() {
    onClose();
    setMode("canvas");
  }

  if (!open) return null;

  return (
    <div className="settings-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-canvas-shortcuts="ignore"
      >
        <header className="settings-windowbar" data-tauri-drag-region>
          <div className="settings-windowbar-brand" data-tauri-drag-region>
            <BrandMark />
            <strong>Flux</strong>
          </div>
          <div className="settings-windowbar-drag" data-tauri-drag-region />
          {isTauriEnv ? (
            <div className="settings-window-controls">
              <button type="button" aria-label="最小化" onClick={() => void minimizeWindow()}><MinimizeIcon /></button>
              <button type="button" aria-label="最大化或还原" onClick={() => void toggleMaximizeWindow()}><MaximizeIcon /></button>
              <button type="button" aria-label="关闭" onClick={() => void closeWindow()}><CloseIcon /></button>
            </div>
          ) : null}
        </header>
        <div className="settings-layout">
          <aside className="settings-navigation">
            <button
              ref={closeRef}
              type="button"
              className="settings-workspace-back"
              aria-label="返回工作区"
              disabled={busy}
              onClick={onClose}
            >
              <BackIcon />
              <span>返回工作区</span>
            </button>

            <nav aria-label="设置分类">
              <span className="settings-navigation-label">外部连接</span>
              <button type="button" className="is-active" aria-current="page">
                <ConnectionIcon />
                <span>MCP 服务</span>
                {connections.length > 0 ? <small>{connections.length}</small> : null}
              </button>
              <p className="settings-navigation-note">
                服务只需连接一次。发现的能力会自动出现在画布节点选择器中。
              </p>
            </nav>

            <div className="settings-navigation-account">
              <span aria-hidden="true">本</span>
              <span><strong>本地空间</strong><small>配置保存在此设备</small></span>
            </div>
          </aside>

          <main className="settings-content">
            <section className="settings-section" aria-labelledby="settings-title">
                <div className="settings-page-header">
                  <div>
                    <h2 id="settings-title">MCP 服务</h2>
                    <p>连接外部服务并发现能力；运行时由画布节点按需调用。</p>
                  </div>
                  <div className="settings-page-actions">
                    <button type="button" onClick={() => startNew("json")} disabled={busy}>从 JSON 导入</button>
                    <button type="button" className="is-primary" onClick={() => startNew()} disabled={busy}>
                      <AddIcon /> 添加服务
                    </button>
                  </div>
                </div>

                <label className="settings-search">
                  <span className="sr-only">搜索 MCP 服务</span>
                  <input
                    type="search"
                    value={query}
                    placeholder="搜索 MCP 服务器…"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                <div className="settings-list-heading">
                  <span>MCP 服务器 <small>{connections.length} 项</small></span>
                  <small>设置中连接 · 画布中使用</small>
                </div>

                {filteredConnections.length > 0 ? (
                  <div className="settings-service-list">
                    {filteredConnections.map((connection) => (
                      <article key={connection.id} className="settings-service-card">
                        <button type="button" className="settings-service-main" onClick={() => edit(connection)}>
                          <span className="settings-service-icon" aria-hidden="true">
                            {connection.transport === "stdio" ? <TerminalIcon /> : <ServerIcon />}
                          </span>
                          <span className="settings-service-copy">
                            <span className="settings-service-name-line">
                              <strong>{connection.name}</strong>
                              <em>{connection.transport === "stdio" ? "STDIO" : "HTTP"}</em>
                              <em>{connection.operations.length} 项能力</em>
                            </span>
                            <small>
                              {connection.transport === "stdio"
                                ? [connection.command, ...connection.args].join(" ")
                                : connection.serverUrl}
                            </small>
                          </span>
                          <span
                            className="settings-service-state"
                            data-state={!connection.enabled
                              ? "disabled"
                              : connection.transport === "streamable-http" && connection.authentication === "bearer" && !hasSessionToken(connection.id)
                                ? "auth"
                                : "ready"}
                          >
                            <span aria-hidden="true" />
                            {!connection.enabled
                              ? "已停用"
                              : connection.transport === "streamable-http" && connection.authentication === "bearer" && !hasSessionToken(connection.id)
                                ? "需要令牌"
                                : connection.transport === "stdio" ? "按需启动" : "已连接"}
                          </span>
                          <ChevronIcon />
                        </button>
                        <label className="settings-service-toggle" title={connection.enabled ? "停用服务" : "启用服务"}>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${connection.enabled ? "停用" : "启用"}服务 ${connection.name}`}
                            checked={connection.enabled}
                            onChange={(event) => void setConnectionEnabled(connection.id, event.target.checked)}
                          />
                          <span aria-hidden="true" />
                        </label>
                        <button
                          type="button"
                          className="settings-service-remove"
                          aria-label={`移除服务 ${connection.name}`}
                          title="移除服务"
                          onClick={() => void removeConnection(connection)}
                        >
                          <TrashIcon />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="settings-service-empty">
                    <span className="settings-service-icon" aria-hidden="true"><ConnectionIcon /></span>
                    <span>
                      <strong>{connections.length === 0 ? "还没有 MCP 服务器" : "没有匹配的服务器"}</strong>
                      <small>{connections.length === 0
                        ? "连接服务后，Flux 会发现它提供的工具并生成可选画布节点。"
                        : "试试服务名称、地址、命令或能力名称。"}</small>
                    </span>
                    {connections.length === 0 ? (
                      <span className="settings-empty-actions">
                        <button type="button" className="settings-empty-action is-primary" onClick={() => startNew()}>添加服务</button>
                        <button type="button" className="settings-empty-action" onClick={() => startNew("json")}>导入 JSON</button>
                      </span>
                    ) : null}
                  </div>
                )}

                {notice ? (
                  <div className="capability-feedback" role="status" aria-live="polite">
                    <StatusIcon />
                    <span>{notice}</span>
                  </div>
                ) : null}

                <div className="settings-canvas-cta">
                  <span className="settings-canvas-cta-icon" aria-hidden="true"><CanvasIcon /></span>
                  <span>
                    <strong>能力在画布中使用</strong>
                    <small>{connections.some((connection) => connection.enabled && connection.operations.length > 0)
                      ? "已连接的能力可以直接作为节点添加到流程。"
                      : "连接并发现能力后，就能在画布的节点选择器中找到它们。"}</small>
                  </span>
                  <button type="button" onClick={goToCanvas}>前往画布</button>
                </div>
              </section>

            {editingOpen ? (
              <div
                className="settings-editor-overlay"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !busy) setEditingOpen(false);
                }}
              >
              <section className="settings-section settings-editor" aria-labelledby="connection-form-title">
                <button
                  type="button"
                  className="settings-back"
                  disabled={busy}
                  onClick={() => {
                    clearFeedback();
                    setLocalError(null);
                    setEditingOpen(false);
                  }}
                >
                  <BackIcon />
                  返回服务列表
                </button>

                <div className="settings-page-header settings-section-header-form">
                  <div>
                    <h2 id="connection-form-title">{editing ? "编辑 MCP 服务" : "添加 MCP 服务"}</h2>
                    <p>选择连接方式并填写服务信息。连接成功后，Flux 会发现并注册可用能力。</p>
                  </div>
                  <span className="capability-protocol-badge">MCP</span>
                </div>

                <div className="settings-editor-tabs" role="tablist" aria-label="MCP 配置方式">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === "form"}
                    className={editorMode === "form" ? "is-active" : undefined}
                    onClick={() => selectEditorMode("form")}
                    disabled={busy}
                  >
                    连接设置
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === "json"}
                    className={editorMode === "json" ? "is-active" : undefined}
                    onClick={() => selectEditorMode("json")}
                    disabled={busy}
                  >
                    JSON 高级编辑
                  </button>
                </div>

                {editorMode === "json" ? (
                  <div className="settings-json-pane">
                    <div className="settings-json-heading">
                      <span><strong>mcpServers JSON</strong><small>兼容常见的 MCP 客户端配置格式，每次添加一个服务。</small></span>
                      <button type="button" onClick={() => setJsonText(createMcpJsonTemplate())} disabled={busy}>恢复示例</button>
                    </div>
                    <textarea
                      aria-label="MCP JSON 配置"
                      value={jsonText}
                      onChange={(event) => {
                        setJsonText(event.target.value);
                        setLocalError(null);
                      }}
                      disabled={busy}
                      spellCheck={false}
                      rows={16}
                    />
                    <p>支持 STDIO 的 command、args、env、cwd，以及 HTTP 的 url、authentication 和 Authorization Bearer 请求头。令牌只保留在当前会话。</p>
                  </div>
                ) : (
                  <div className="capability-form settings-connection-form">
                  <Field label="服务名称" htmlFor="mcp-connection-name">
                    <Input
                      id="mcp-connection-name"
                      value={draft.name}
                      disabled={busy}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </Field>

                  <fieldset className="settings-transport-picker">
                    <legend>连接方式</legend>
                    <label data-active={draft.transport === "streamable-http" ? "true" : "false"}>
                      <input
                        type="radio"
                        name="mcp-transport"
                        value="streamable-http"
                        checked={draft.transport === "streamable-http"}
                        disabled={busy}
                        onChange={() => setDraft((current) => ({ ...current, transport: "streamable-http" }))}
                      />
                      <span className="settings-transport-icon"><ServerIcon /></span>
                      <span>
                        <strong>Streamable HTTP</strong>
                        <small>连接已经运行的远程或本机服务</small>
                      </span>
                    </label>
                    <label data-active={draft.transport === "stdio" ? "true" : "false"}>
                      <input
                        type="radio"
                        name="mcp-transport"
                        value="stdio"
                        checked={draft.transport === "stdio"}
                        disabled={busy}
                        onChange={() => setDraft((current) => ({ ...current, transport: "stdio", authentication: "none" }))}
                      />
                      <span className="settings-transport-icon"><TerminalIcon /></span>
                      <span>
                        <strong>STDIO</strong>
                        <small>由 Flux 启动并连接本地命令</small>
                      </span>
                    </label>
                  </fieldset>

                  {draft.transport === "streamable-http" ? (
                    <>
                      <Field
                        label="服务地址"
                        htmlFor="mcp-server-url"
                        hint="远程服务使用 HTTPS；本机服务可使用 localhost HTTP。Flux 不会启动该服务。"
                      >
                        <Input
                          id="mcp-server-url"
                          type="url"
                          spellCheck={false}
                          value={draft.serverUrl}
                          disabled={busy}
                          onChange={(event) => setDraft((current) => ({ ...current, serverUrl: event.target.value }))}
                        />
                      </Field>
                      <Field label="认证方式" htmlFor="mcp-authentication">
                        <Select
                          id="mcp-authentication"
                          value={draft.authentication}
                          disabled={busy}
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            authentication: event.target.value as McpConnectionDraft["authentication"],
                          }))}
                        >
                          <option value="none">无需认证</option>
                          <option value="bearer">Bearer 访问令牌</option>
                        </Select>
                      </Field>
                      {draft.authentication === "bearer" ? (
                        <Field
                          label="访问令牌"
                          htmlFor="mcp-access-token"
                          hint={editing && hasSessionToken(editing.id)
                            ? "当前会话已有令牌；留空将继续使用。"
                            : "只保留在当前桌面会话，关闭应用后自动清除。"}
                        >
                          <Input
                            id="mcp-access-token"
                            type="password"
                            autoComplete="off"
                            value={token}
                            disabled={busy}
                            onChange={(event) => setToken(event.target.value)}
                          />
                        </Field>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="settings-stdio-warning" role="note">
                        <AlertIcon />
                        <span><strong>Flux 将启动本地进程</strong><small>命令不会经过 shell；请仅配置你信任的程序和参数。</small></span>
                      </div>
                      <Field label="启动命令" htmlFor="mcp-stdio-command" hint="例如：npx、node、python 或可执行文件的完整路径。">
                        <Input
                          id="mcp-stdio-command"
                          value={draft.command}
                          disabled={busy}
                          spellCheck={false}
                          onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
                        />
                      </Field>
                      <Field label="参数" htmlFor="mcp-stdio-args" hint="每行一个参数，不进行 shell 拆词或变量展开。">
                        <textarea
                          id="mcp-stdio-args"
                          value={draft.argsText}
                          disabled={busy}
                          spellCheck={false}
                          rows={3}
                          onChange={(event) => setDraft((current) => ({ ...current, argsText: event.target.value }))}
                        />
                      </Field>
                      <Field label="工作目录（可选）" htmlFor="mcp-stdio-cwd">
                        <Input
                          id="mcp-stdio-cwd"
                          value={draft.cwd}
                          disabled={busy}
                          spellCheck={false}
                          onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))}
                        />
                      </Field>
                      <Field label="环境变量（可选）" htmlFor="mcp-stdio-environment" hint="每行使用 KEY=value；内容会保存在本机 Flux 数据目录。">
                        <textarea
                          id="mcp-stdio-environment"
                          value={draft.environmentText}
                          disabled={busy}
                          spellCheck={false}
                          rows={3}
                          placeholder="API_BASE_URL=https://example.com"
                          onChange={(event) => setDraft((current) => ({ ...current, environmentText: event.target.value }))}
                        />
                      </Field>
                    </>
                  )}
                  </div>
                )}

                {editing ? (
                  <div className="settings-discovered-capabilities">
                    <div>
                      <strong>已发现能力</strong>
                      <small>{editing.operations.length} 项</small>
                    </div>
                    {editing.operations.length > 0 ? (
                      <ul>
                        {editing.operations.slice(0, 8).map((operation) => (
                          <li key={operation.id}>
                            <span><strong>{operation.title}</strong><small>{operation.description || operation.externalName}</small></span>
                            <em data-effect={operation.effect}>{operation.effect === "read" ? "读取" : operation.effect === "write" ? "写入" : "危险操作"}</em>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>尚未发现能力。保存后 Flux 会连接服务并重新读取工具清单。</p>
                    )}
                  </div>
                ) : null}

                {(localError || storeError) ? (
                  <div className="capability-feedback is-error" role="alert">
                    <AlertIcon />
                    <span>{localError ?? storeError}</span>
                  </div>
                ) : notice ? (
                  <div className="capability-feedback" role="status" aria-live="polite">
                    <StatusIcon />
                    <span>{notice}</span>
                  </div>
                ) : null}

                <div className="settings-form-actions">
                  <Button type="button" variant="ghost" onClick={() => setEditingOpen(false)} disabled={busy}>
                    取消
                  </Button>
                  <Button type="button" onClick={() => void submit()} disabled={busy}>
                    {editorMode === "json"
                      ? busy ? "正在保存并发现…" : editing ? "保存并重新发现" : "保存并发现能力"
                      : busy
                      ? draft.transport === "stdio" ? "正在启动并发现…" : "正在连接并发现…"
                      : editing
                        ? "保存并重新发现"
                        : draft.transport === "stdio" ? "启动并发现能力" : "连接并发现能力"}
                  </Button>
                </div>
              </section>
              </div>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  );
}

function ConnectionIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M8.5 15.5l7-7M7 8.5l-2 2a3.5 3.5 0 005 5l2-2m5-5l2-2a3.5 3.5 0 00-5-5l-2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 4h10M6 2.5h4M5 4l.5 9h5l.5-9M6.7 6.5v4M9.3 6.5v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}

function ServerIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" /><rect x="3" y="11.5" width="14" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" /><path d="M6 5.8h.1M6 14.3h.1M9 5.8h5M9 14.3h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" /></svg>;
}

function TerminalIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20"><rect x="2.5" y="3" width="15" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.35" /><path d="m5.5 7 2.5 2.2-2.5 2.2M10 12h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" /></svg>;
}

function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" /></svg>;
}

function BackIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" /></svg>;
}

function CanvasIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20"><rect x="3" y="3" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" /><rect x="12" y="12" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5.5h3a3.5 3.5 0 0 1 3.5 3.5v3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" /></svg>;
}

function AlertIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 2l6 11H2L8 2zM8 5.5v3.5M8 11.5v.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function StatusIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AddIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" /></svg>;
}

function MinimizeIcon() {
  return <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1 5.5h9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>;
}

function MaximizeIcon() {
  return <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" /></svg>;
}

function CloseIcon() {
  return <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="m2 2 7 7M9 2 2 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1" /></svg>;
}
