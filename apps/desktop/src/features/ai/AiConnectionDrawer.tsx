import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Button, Drawer, Input, Select } from "@flux/ui";
import {
  type AiConnection,
  type AiConnectionStatus,
  type AiProvider,
} from "../../lib/api.js";
import { useAppStore } from "../../store/appStore.js";
import { useAiConnectionsStore } from "../../store/aiConnectionsStore.js";

const PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string; model: string }> = {
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "qwen3:8b",
  },
};

interface ConnectionForm {
  provider: AiProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
}

interface FieldErrors {
  label?: string;
  baseUrl?: string;
  defaultModel?: string;
}

function emptyForm(provider: AiProvider = "openai-compatible"): ConnectionForm {
  return {
    provider,
    label: provider === "ollama" ? "本地 Ollama" : "我的模型服务",
    baseUrl: PROVIDER_DEFAULTS[provider].baseUrl,
    defaultModel: PROVIDER_DEFAULTS[provider].model,
    apiKey: "",
  };
}

function validate(form: ConnectionForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.label.trim()) errors.label = "请输入便于识别的连接名称。";
  if (!form.defaultModel.trim()) errors.defaultModel = "请输入默认模型名称。";
  try {
    const url = new URL(form.baseUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.baseUrl = "服务地址仅支持 http 或 https。";
    }
  } catch {
    errors.baseUrl = "请输入完整的服务地址。";
  }
  return errors;
}

function providerLabel(provider: AiProvider): string {
  return provider === "ollama" ? "Ollama" : "OpenAI 兼容 API";
}

function statusLabel(status: AiConnectionStatus): string {
  if (status === "connected") return "已连接";
  if (status === "unavailable") return "连接失败";
  return "待校验";
}

function formatTestTime(value?: string | null): string {
  if (!value) return "尚未校验";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已校验";
  return `校验于 ${date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function AiConnectionDrawer() {
  const open = useAppStore((state) => state.aiAccessOpen);
  const close = useAppStore((state) => state.closeAiAccess);
  const connections = useAiConnectionsStore((state) => state.connections);
  const loadStatus = useAiConnectionsStore((state) => state.loadStatus);
  const pendingAction = useAiConnectionsStore((state) => state.pendingAction);
  const error = useAiConnectionsStore((state) => state.error);
  const notice = useAiConnectionsStore((state) => state.notice);
  const load = useAiConnectionsStore((state) => state.load);
  const createAndTest = useAiConnectionsStore((state) => state.createAndTest);
  const test = useAiConnectionsStore((state) => state.test);
  const remove = useAiConnectionsStore((state) => state.remove);
  const clearFeedback = useAiConnectionsStore((state) => state.clearFeedback);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ConnectionForm>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [isOverlay, setIsOverlay] = useState(() => window.innerWidth < 1280);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const connectedCount = useMemo(
    () => connections.filter((item) => item.status === "connected").length,
    [connections],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsOverlay(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusFrame = requestAnimationFrame(() => titleRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !isOverlay) return;
      const panel = rootRef.current?.querySelector<HTMLElement>(
        ".ai-connection-drawer",
      );
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((item) => item.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === titleRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown, true);
      const previous = previousFocusRef.current;
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
        else document.getElementById("account-menu-trigger")?.focus();
      });
    };
  }, [close, isOverlay, open]);

  useEffect(() => {
    if (!formOpen) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById("ai-label")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [formOpen]);

  function resetForm(provider: AiProvider = "openai-compatible") {
    setForm(emptyForm(provider));
    setFieldErrors({});
    setShowApiKey(false);
  }

  function openForm(provider: AiProvider = "openai-compatible") {
    clearFeedback();
    resetForm(provider);
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    resetForm();
  }

  function changeProvider(provider: AiProvider) {
    const nextDefaults = PROVIDER_DEFAULTS[provider];
    setForm((current) => ({
      ...current,
      provider,
      label:
        !current.label.trim() ||
        current.label === "我的模型服务" ||
        current.label === "本地 Ollama"
          ? provider === "ollama"
            ? "本地 Ollama"
            : "我的模型服务"
          : current.label,
      baseUrl: nextDefaults.baseUrl,
      defaultModel: nextDefaults.model,
      apiKey: "",
    }));
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await createAndTest({
        provider: form.provider,
        label: form.label.trim(),
        baseUrl: form.baseUrl.trim().replace(/\/$/, ""),
        defaultModel: form.defaultModel.trim(),
        apiKey: form.apiKey.trim() || undefined,
      });
      setFormOpen(false);
      resetForm();
    } catch {
      // Store 已提供对用户可执行的恢复提示，表单保留以便修正。
    }
  }

  async function removeConnection(connection: AiConnection) {
    const confirmed = window.confirm(
      `断开“${connection.label}”？使用该模型服务的 AI 工作流将无法继续运行。`,
    );
    if (!confirmed) return;
    try {
      await remove(connection.id);
    } catch {
      // Store 负责错误呈现。
    }
  }

  if (!open) return null;

  const drawer = (
    <Drawer
      open
      onClose={close}
      title={
        <span
          id="ai-connection-drawer-title"
          ref={titleRef}
          tabIndex={-1}
          style={{ outline: "none" }}
        >
          AI 接入
        </span>
      }
      width={320}
      variant={isOverlay ? "overlay" : "push"}
      role={isOverlay ? "dialog" : "complementary"}
      ariaLabelledBy="ai-connection-drawer-title"
      className="ai-connection-drawer"
    >
      <div style={drawerBody}>
        <section aria-labelledby="ai-access-summary" style={introCard}>
          <span aria-hidden="true" style={aiMark}>
            <svg width="18" height="18" viewBox="0 0 20 20">
              <path
                d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.4"
              />
              <circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={introHeading}>
              <strong id="ai-access-summary" style={introTitle}>
                模型服务
              </strong>
              <span style={connectionCount}>
                {connectedCount > 0 ? `${connectedCount} 个可用` : "未连接"}
              </span>
            </div>
            <p style={introCopy}>
              连接后由 Flux 服务端调用模型。API Key 不会回显，也不会写入工作流。
            </p>
          </div>
        </section>

        {error && (
          <div role="alert" style={errorBox}>
            <span>{error}</span>
            {loadStatus === "error" && (
              <button type="button" onClick={() => void load(true)} style={inlineAction}>
                重试
              </button>
            )}
          </div>
        )}
        {notice && (
          <div role="status" aria-live="polite" style={noticeBox}>
            {notice}
          </div>
        )}

        {formOpen ? (
          <form aria-label="添加模型服务" onSubmit={(event) => void submit(event)} style={formStyle}>
            <div style={sectionHeading}>
              <strong style={sectionTitle}>添加模型服务</strong>
              <span style={sectionHint}>保存后立即校验</span>
            </div>

            <FormField label="接入方式" htmlFor="ai-provider">
              <Select
                id="ai-provider"
                value={form.provider}
                onChange={(event) => changeProvider(event.target.value as AiProvider)}
              >
                <option value="openai-compatible">OpenAI 兼容 API</option>
                <option value="ollama">Ollama</option>
              </Select>
            </FormField>

            <FormField
              label="连接名称"
              htmlFor="ai-label"
              error={fieldErrors.label}
            >
              <Input
                id="ai-label"
                value={form.label}
                aria-invalid={Boolean(fieldErrors.label)}
                aria-describedby={fieldErrors.label ? "ai-label-error" : undefined}
                onChange={(event) =>
                  setForm((current) => ({ ...current, label: event.target.value }))
                }
              />
            </FormField>

            <FormField
              label="服务地址"
              htmlFor="ai-base-url"
              hint={
                form.provider === "ollama"
                  ? "填写 Ollama 服务根地址。"
                  : "填写兼容 OpenAI API 的 /v1 地址。"
              }
              error={fieldErrors.baseUrl}
            >
              <Input
                id="ai-base-url"
                type="url"
                value={form.baseUrl}
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors.baseUrl)}
                aria-describedby={
                  fieldErrors.baseUrl ? "ai-base-url-error" : "ai-base-url-hint"
                }
                onChange={(event) =>
                  setForm((current) => ({ ...current, baseUrl: event.target.value }))
                }
              />
            </FormField>

            <FormField
              label="默认模型"
              htmlFor="ai-default-model"
              hint="需与服务端已安装或已授权的模型名称一致。"
              error={fieldErrors.defaultModel}
            >
              <Input
                id="ai-default-model"
                value={form.defaultModel}
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors.defaultModel)}
                aria-describedby={
                  fieldErrors.defaultModel
                    ? "ai-default-model-error"
                    : "ai-default-model-hint"
                }
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultModel: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField
              label="API Key"
              htmlFor="ai-api-key"
              hint={
                form.provider === "ollama"
                  ? "本地 Ollama 通常无需填写。"
                  : "密钥将加密保存在服务端，保存后不再显示。"
              }
            >
              <div style={secretInputWrap}>
                <Input
                  id="ai-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={form.apiKey}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-describedby="ai-api-key-hint"
                  style={{ paddingRight: 42 }}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, apiKey: event.target.value }))
                  }
                />
                <button
                  type="button"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  aria-pressed={showApiKey}
                  title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey((value) => !value)}
                  style={secretToggle}
                >
                  <SecretIcon visible={showApiKey} />
                </button>
              </div>
            </FormField>

            <div style={formActions}>
              <Button type="button" variant="ghost" onClick={cancelForm} disabled={pendingAction === "create"}>
                取消
              </Button>
              <Button type="submit" disabled={pendingAction === "create"}>
                {pendingAction === "create" ? "保存并校验中…" : "保存并校验"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <section aria-labelledby="ai-connections-heading" style={connectionsSection}>
              <div style={sectionHeading}>
                <strong id="ai-connections-heading" style={sectionTitle}>
                  已接入
                </strong>
                {connections.length > 0 && (
                  <button type="button" onClick={() => openForm()} style={inlineAction}>
                    添加
                  </button>
                )}
              </div>

              {loadStatus === "loading" && connections.length === 0 ? (
                <div role="status" aria-live="polite" style={loadingState}>
                  <span className="ai-connection-loading-track" aria-hidden="true" />
                  正在读取模型服务…
                </div>
              ) : connections.length === 0 ? (
                <div style={emptyState}>
                  <span aria-hidden="true" style={emptyIcon}>
                    <svg width="22" height="22" viewBox="0 0 24 24">
                      <path
                        d="M8.5 8.5 5 12l3.5 3.5M15.5 8.5 19 12l-3.5 3.5M14 5l-4 14"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </span>
                  <strong style={emptyTitle}>还没有模型服务</strong>
                  <span style={emptyCopy}>
                    接入云端 API 或本地 Ollama，为 AI 工作流提供模型能力。
                  </span>
                  <div style={emptyActions}>
                    <Button type="button" onClick={() => openForm("openai-compatible")}>
                      连接模型服务
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => openForm("ollama")}>
                      使用 Ollama
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={connectionList}>
                  {connections.map((connection) => (
                    <ConnectionCard
                      key={connection.id}
                      connection={connection}
                      testing={pendingAction === `test:${connection.id}`}
                      removing={pendingAction === `remove:${connection.id}`}
                      onTest={() => {
                        void test(connection.id).catch(() => undefined);
                      }}
                      onRemove={() => void removeConnection(connection)}
                    />
                  ))}
                </div>
              )}
            </section>

            {connections.length > 0 && (
              <p style={defaultHint}>
                未在节点中指定时，Flux 将使用最早接入且可用的模型服务。
              </p>
            )}
          </>
        )}
      </div>
    </Drawer>
  );

  return (
    <div
      ref={rootRef}
      className={isOverlay ? "ai-connection-overlay" : "ai-connection-push"}
      onMouseDown={(event) => {
        if (isOverlay && event.target === event.currentTarget) close();
      }}
      style={isOverlay ? overlayWrap : pushWrap}
    >
      {drawer}
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={fieldStyle}>
      <label htmlFor={htmlFor} style={fieldLabel}>
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${htmlFor}-error`} role="alert" style={fieldError}>
          {error}
        </span>
      ) : hint ? (
        <span id={`${htmlFor}-hint`} style={fieldHint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function ConnectionCard({
  connection,
  testing,
  removing,
  onTest,
  onRemove,
}: {
  connection: AiConnection;
  testing: boolean;
  removing: boolean;
  onTest: () => void;
  onRemove: () => void;
}) {
  return (
    <article style={connectionCard}>
      <div style={connectionCardHeader}>
        <span style={connectionIdentity}>
          <strong style={connectionName}>{connection.label}</strong>
          <span style={connectionProvider}>{providerLabel(connection.provider)}</span>
        </span>
        <span style={statusBadge(connection.status)}>
          <span aria-hidden="true" style={statusDot(connection.status)} />
          {statusLabel(connection.status)}
        </span>
      </div>
      <div style={connectionDetails}>
        <span style={detailLabel}>模型</span>
        <strong style={detailValue}>{connection.defaultModel}</strong>
        <span style={detailLabel}>凭证</span>
        <span style={detailValue}>
          {connection.hasApiKey ? "密钥已保存" : "未使用密钥"}
        </span>
      </div>
      {connection.errorMessage && connection.status === "unavailable" && (
        <p role="alert" style={connectionError}>
          {connection.errorMessage}
        </p>
      )}
      <div style={connectionFooter}>
        <span style={testedAt}>{formatTestTime(connection.lastTestedAt)}</span>
        <span style={cardActions}>
          <button type="button" onClick={onTest} disabled={testing || removing} style={cardAction}>
            {testing ? "校验中…" : "重新校验"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={testing || removing}
            style={{ ...cardAction, color: "var(--danger)" }}
          >
            {removing ? "断开中…" : "断开"}
          </button>
        </span>
      </div>
    </article>
  );
}

function SecretIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 2l12 12M6.2 6.3A2.4 2.4 0 0 0 9.7 9.7M4.1 4.4C2.7 5.4 1.8 6.8 1.5 8c.8 2.7 3.4 4.6 6.5 4.6 1 0 2-.2 2.8-.6M7.2 3.5A7 7 0 0 1 8 3.4c3.1 0 5.7 1.9 6.5 4.6a6.6 6.6 0 0 1-1.3 2.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 8C2.3 5.3 4.9 3.4 8 3.4s5.7 1.9 6.5 4.6c-.8 2.7-3.4 4.6-6.5 4.6S2.3 10.7 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

const overlayWrap: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: "var(--z-drawer)" as unknown as number,
  background: "var(--overlay-scrim)",
};

const pushWrap: CSSProperties = {
  display: "contents",
};

const drawerBody: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const introCard: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr)",
  gap: "var(--space-3)",
  padding: "var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-inset)",
};

const aiMark: CSSProperties = {
  width: 36,
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-md)",
  background: "var(--success-subtle)",
  color: "var(--carrier-ai)",
};

const introHeading: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
};

const introTitle: CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--text-md)",
};

const connectionCount: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  whiteSpace: "nowrap",
};

const introCopy: CSSProperties = {
  margin: "var(--space-1) 0 0",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.55,
};

const errorBox: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius-md)",
  background: "var(--danger-subtle)",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.5,
};

const noticeBox: CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--success)",
  borderRadius: "var(--radius-md)",
  background: "var(--success-subtle)",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.5,
};

const inlineAction: CSSProperties = {
  minHeight: 28,
  padding: "0 var(--space-2)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const sectionHeading: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
};

const sectionTitle: CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
};

const sectionHint: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const connectionsSection: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const loadingState: CSSProperties = {
  minHeight: 112,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
};

const emptyState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "var(--space-6) var(--space-3)",
  border: "1px dashed var(--border-strong)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-inset)",
  textAlign: "center",
};

const emptyIcon: CSSProperties = {
  width: 42,
  height: 42,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "var(--space-3)",
  borderRadius: "var(--radius-lg)",
  background: "var(--success-subtle)",
  color: "var(--carrier-ai)",
};

const emptyTitle: CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--text-md)",
};

const emptyCopy: CSSProperties = {
  maxWidth: 240,
  marginTop: "var(--space-1)",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.55,
};

const emptyActions: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  width: "100%",
  marginTop: "var(--space-4)",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

const fieldLabel: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
};

const fieldHint: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.45,
};

const fieldError: CSSProperties = {
  color: "var(--danger)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.45,
};

const secretInputWrap: CSSProperties = {
  position: "relative",
};

const secretToggle: CSSProperties = {
  position: "absolute",
  top: "50%",
  right: "var(--space-1)",
  width: 32,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  transform: "translateY(-50%)",
};

const formActions: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
  paddingTop: "var(--space-2)",
  borderTop: "1px solid var(--border-subtle)",
};

const connectionList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const connectionCard: CSSProperties = {
  overflow: "hidden",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-inset)",
};

const connectionCardHeader: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  padding: "var(--space-3)",
};

const connectionIdentity: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const connectionName: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
};

const connectionProvider: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

function statusBadge(status: AiConnectionStatus): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    flexShrink: 0,
    padding: "3px 7px",
    borderRadius: "var(--radius-full)",
    background:
      status === "connected"
        ? "var(--success-subtle)"
        : status === "unavailable"
          ? "var(--danger-subtle)"
          : "var(--warning-subtle)",
    color:
      status === "connected"
        ? "var(--success)"
        : status === "unavailable"
          ? "var(--danger)"
          : "var(--warning)",
    fontSize: "var(--text-xs)",
    fontWeight: 650,
    whiteSpace: "nowrap",
  };
}

function statusDot(status: AiConnectionStatus): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "var(--radius-full)",
    background:
      status === "connected"
        ? "var(--success)"
        : status === "unavailable"
          ? "var(--danger)"
          : "var(--warning)",
  };
}

const connectionDetails: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr)",
  gap: "var(--space-1) var(--space-2)",
  padding: "0 var(--space-3) var(--space-3)",
};

const detailLabel: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const detailValue: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
  fontSize: "var(--text-xs)",
  fontWeight: 500,
};

const connectionError: CSSProperties = {
  margin: "0 var(--space-3) var(--space-3)",
  padding: "var(--space-2)",
  borderRadius: "var(--radius-sm)",
  background: "var(--danger-subtle)",
  color: "var(--text-primary)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.45,
};

const connectionFooter: CSSProperties = {
  minHeight: 36,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  padding: "var(--space-1) var(--space-2) var(--space-1) var(--space-3)",
  borderTop: "1px solid var(--border-subtle)",
};

const testedAt: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
};

const cardActions: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
};

const cardAction: CSSProperties = {
  minHeight: 28,
  padding: "0 var(--space-2)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
};

const defaultHint: CSSProperties = {
  margin: 0,
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.5,
};
