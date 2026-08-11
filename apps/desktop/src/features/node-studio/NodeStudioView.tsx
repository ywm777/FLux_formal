import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  validateCustomNodeDraft,
  type CustomNodeCapabilityRequest,
  type CustomNodeDraft,
  type CustomNodePortDataType,
  type CustomNodeTestCase,
  type JSONSchema,
  type PortSpec,
} from "@flux/node-sdk";
import { useAuthStore } from "../../store/authStore.js";
import { useAiConnectionsStore } from "../../store/aiConnectionsStore.js";
import { formatProductErrorMessage } from "../../lib/productError.js";
import { generateCustomNodeDraft } from "./infrastructure/nodeDraftAiAdapter.js";
import {
  cloneCustomNodeDraft,
  createStarterCustomNodeDraft,
  hasUnpublishedCustomNodeChanges,
  type CustomNodePackage,
} from "./domain/customNodePackage.js";
import { useCustomNodeStore } from "./store/customNodeStore.js";
import {
  createHttpConnectionDraft,
  useHttpConnectionStore,
} from "./store/httpConnectionStore.js";
import {
  HTTP_METHODS,
  type HttpConnection,
  type HttpConnectionDraft,
} from "../../lib/capabilities/httpConnection.js";

type EditorTab = "definition" | "interface" | "logic";
type BusyAction = "save" | "test" | "activate" | "disable" | "ai" | null;

const CATEGORY_OPTIONS: Array<{ value: CustomNodeDraft["category"]; label: string }> = [
  { value: "source", label: "入口" },
  { value: "transform", label: "处理" },
  { value: "control", label: "流程" },
  { value: "integration", label: "连接" },
  { value: "output", label: "输出" },
];

const ICON_OPTIONS = [
  "wand",
  "braces",
  "database",
  "file-json",
  "globe",
  "sparkles",
  "text",
  "workflow",
] as const;

const DATA_TYPES: CustomNodePortDataType[] = [
  "any",
  "string",
  "number",
  "boolean",
  "object",
  "array",
];

function StudioIcon({
  name,
  size = 16,
}: {
  name: "plus" | "sparkles" | "save" | "play" | "check" | "power" | "node" | "close";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    plus: <path d="M8 2.5v11M2.5 8h11" />,
    sparkles: <path d="m8 1 1.2 3.8L13 6l-3.8 1.2L8 11 6.8 7.2 3 6l3.8-1.2L8 1Zm5 9 .6 1.8 1.9.7-1.9.6L13 16l-.6-1.9-1.9-.6 1.9-.7L13 10Z" />,
    save: <path d="M3 2.5h8.5L14 5v8.5H2V2.5h1Zm2 0v4h6v-4M5 13.5V9h6v4.5" />,
    play: <path d="m5 3 8 5-8 5V3Z" />,
    check: <path d="m3 8.5 3 3L13 4.5" />,
    power: <path d="M8 1.5v6M4 3.6a5.5 5.5 0 1 0 8 0" />,
    node: <><rect x="2" y="3" width="5" height="4" rx="1" /><rect x="9" y="9" width="5" height="4" rx="1" /><path d="M7 5h2v6" /></>,
    close: <path d="m3 3 10 10M13 3 3 13" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

function statusMeta(nodePackage: CustomNodePackage): {
  label: string;
  tone: "neutral" | "success" | "warning";
} {
  if (nodePackage.lifecycle === "disabled") {
    return { label: "已停用", tone: "neutral" };
  }
  if (nodePackage.activeRevision && hasUnpublishedCustomNodeChanges(nodePackage)) {
    return { label: `v${nodePackage.activeRevision.version} · 有新草稿`, tone: "warning" };
  }
  if (nodePackage.activeRevision) {
    return { label: `已启用 v${nodePackage.activeRevision.version}`, tone: "success" };
  }
  if (nodePackage.lifecycle === "tested") {
    return { label: "测试通过", tone: "success" };
  }
  if (nodePackage.lifecycle === "validated") {
    return { label: "规则通过", tone: "warning" };
  }
  return { label: "草稿", tone: "neutral" };
}

export function NodeStudioView({ active = true }: { active?: boolean }) {
  const packages = useCustomNodeStore((state) => state.packages);
  const loadStatus = useCustomNodeStore((state) => state.loadStatus);
  const storeNotice = useCustomNodeStore((state) => state.notice);
  const storeError = useCustomNodeStore((state) => state.error);
  const load = useCustomNodeStore((state) => state.load);
  const saveDraft = useCustomNodeStore((state) => state.saveDraft);
  const testDraft = useCustomNodeStore((state) => state.testDraft);
  const activateDraft = useCustomNodeStore((state) => state.activateDraft);
  const disable = useCustomNodeStore((state) => state.disable);
  const clearFeedback = useCustomNodeStore((state) => state.clearFeedback);
  const authStatus = useAuthStore((state) => state.status);
  const aiConnections = useAiConnectionsStore((state) => state.connections);
  const aiLoadStatus = useAiConnectionsStore((state) => state.loadStatus);
  const loadAiConnections = useAiConnectionsStore((state) => state.load);
  const httpConnections = useHttpConnectionStore((state) => state.connections);
  const httpConnectionLoadStatus = useHttpConnectionStore((state) => state.loadStatus);
  const loadHttpConnections = useHttpConnectionStore((state) => state.load);

  const starter = useMemo(() => createStarterCustomNodeDraft(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomNodeDraft>(() => cloneCustomNodeDraft(starter));
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState(() => JSON.stringify({ draft: starter, bindings: {} }));
  const [tab, setTab] = useState<EditorTab>("definition");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [aiRequest, setAiRequest] = useState("");

  const selectedPackage = packages.find((item) => item.id === selectedId);
  const validation = useMemo(() => validateCustomNodeDraft(draft), [draft]);
  const issues = validation.success ? [] : validation.issues;
  const dirty = JSON.stringify({ draft, bindings }) !== baseline;
  const connectedAi = aiConnections.some((connection) => connection.status === "connected");
  const feedbackError = localError ?? storeError;
  const feedbackNotice = localNotice ?? storeNotice;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadHttpConnections();
  }, [loadHttpConnections]);

  useEffect(() => {
    if (!active || authStatus !== "authenticated") return;
    void loadAiConnections();
  }, [active, authStatus, loadAiConnections]);

  function clearLocalFeedback() {
    setLocalError(null);
    setLocalNotice(null);
    clearFeedback();
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("当前节点有未保存修改，确定要离开吗？");
  }

  function choosePackage(nodePackage: CustomNodePackage) {
    if (!confirmDiscard()) return;
    clearLocalFeedback();
    setSelectedId(nodePackage.id);
    setDraft(cloneCustomNodeDraft(nodePackage.draft));
    setBindings(structuredClone(nodePackage.bindings));
    setBaseline(JSON.stringify({ draft: nodePackage.draft, bindings: nodePackage.bindings }));
    setTab("definition");
  }

  function createNewDraft() {
    if (!confirmDiscard()) return;
    const next = createStarterCustomNodeDraft();
    clearLocalFeedback();
    setSelectedId(null);
    setDraft(next);
    setBindings({});
    setBaseline(JSON.stringify({ draft: next, bindings: {} }));
    setTab("definition");
  }

  async function runAction(
    action: Exclude<BusyAction, null>,
    task: () => Promise<CustomNodePackage | void>,
  ) {
    clearLocalFeedback();
    setBusy(action);
    try {
      const result = await task();
      if (result) {
        setSelectedId(result.id);
        setDraft(cloneCustomNodeDraft(result.draft));
        setBindings(structuredClone(result.bindings));
        setBaseline(JSON.stringify({ draft: result.draft, bindings: result.bindings }));
      }
    } catch (error) {
      setLocalError(formatProductErrorMessage(error, "节点操作没有完成。"));
    } finally {
      setBusy(null);
    }
  }

  function handleSave() {
    return runAction("save", () => saveDraft(selectedId, draft, bindings));
  }

  function handleTest() {
    setTab("logic");
    return runAction("test", () => testDraft(selectedId, draft, bindings));
  }

  function handleActivate() {
    setTab("logic");
    return runAction("activate", () => activateDraft(selectedId, draft, bindings));
  }

  function handleDisable() {
    if (!selectedPackage) return;
    void runAction("disable", async () => {
      await disable(selectedPackage.id);
      return undefined;
    });
  }

  async function handleAiGenerate() {
    await runAction("ai", async () => {
      const generated = await generateCustomNodeDraft(aiRequest);
      setDraft(generated);
      setBindings({});
      setTab("definition");
      setLocalNotice("AI 已生成符合 Flux 规则的节点草案，请检查后运行测试。");
      return undefined;
    });
  }

  return (
    <section
      className="node-studio"
      aria-label="节点设计工作台"
      aria-hidden={!active}
    >
      <aside className="node-studio-library" aria-label="个人节点库">
        <div className="node-studio-library-heading">
          <div>
            <span className="node-studio-eyebrow">PERSONAL LIBRARY</span>
            <h2>我的节点</h2>
          </div>
          <button
            type="button"
            className="node-studio-icon-button"
            aria-label="创建新节点"
            title="创建新节点"
            onClick={createNewDraft}
          >
            <StudioIcon name="plus" />
          </button>
        </div>

        <button
          type="button"
          className={`node-studio-new-card ${selectedId === null ? "is-selected" : ""}`}
          onClick={createNewDraft}
        >
          <span className="node-studio-new-icon"><StudioIcon name="plus" /></span>
          <span>
            <strong>创建节点</strong>
            <small>从描述或空白草案开始</small>
          </span>
        </button>

        <div className="node-studio-library-list">
          {loadStatus === "loading" ? (
            <div className="node-studio-empty" role="status">正在读取个人节点库…</div>
          ) : packages.length === 0 ? (
            <div className="node-studio-empty">
              这里会保存你创造的节点。启用后，它们会出现在画布的节点面板中。
            </div>
          ) : packages.map((nodePackage) => {
            const status = statusMeta(nodePackage);
            return (
              <button
                type="button"
                key={nodePackage.id}
                className={`node-studio-library-card ${selectedId === nodePackage.id ? "is-selected" : ""}`}
                onClick={() => choosePackage(nodePackage)}
              >
                <span className="node-studio-library-card-icon">
                  <StudioIcon name="node" />
                </span>
                <span className="node-studio-library-card-copy">
                  <strong>{nodePackage.draft.name}</strong>
                  <small>{nodePackage.draft.description}</small>
                  <span className={`node-studio-status is-${status.tone}`}>{status.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="node-studio-library-footnote">
          <span className="node-studio-footnote-dot" />
          个人节点统一遵循同一套协议、测试和版本规则
        </div>
      </aside>

      <main className="node-studio-editor">
        <header className="node-studio-header">
          <div>
            <span className="node-studio-eyebrow">NODE OBJECT V1</span>
            <h1>节点设计器</h1>
            <p>定义清楚输入、输出和权限，剩下的能力由你创造。</p>
          </div>
          <div className="node-studio-principle">
            <span>规则有界</span>
            <i aria-hidden="true" />
            <strong>能力无界</strong>
          </div>
        </header>

        <div className="node-studio-scroll">
          <section className="node-studio-ai-card" aria-labelledby="node-ai-title">
            <div className="node-studio-ai-mark"><StudioIcon name="sparkles" size={18} /></div>
            <div className="node-studio-ai-content">
              <div className="node-studio-section-title">
                <div>
                  <h2 id="node-ai-title">告诉 AI，你想创造什么节点</h2>
                  <p>AI 负责生成草案，Flux 规则、测试和权限系统负责保证它可控。</p>
                </div>
                <span className="node-studio-beta">AI COPILOT</span>
              </div>
              <div className="node-studio-ai-composer">
                <label htmlFor="node-ai-request" className="sr-only">节点需求描述</label>
                <textarea
                  id="node-ai-request"
                  value={aiRequest}
                  onChange={(event) => setAiRequest(event.target.value)}
                  placeholder="例如：创建一个节点，接收订单数组，筛选金额大于配置值的订单，并输出订单数量和结果列表。"
                  rows={3}
                />
                <button
                  type="button"
                  className="node-studio-primary-button"
                  disabled={busy !== null || !connectedAi || aiRequest.trim().length < 8}
                  onClick={() => void handleAiGenerate()}
                >
                  <StudioIcon name="sparkles" />
                  {busy === "ai" ? "正在设计…" : "生成节点草案"}
                </button>
              </div>
              {authStatus !== "authenticated" ? (
                <p className="node-studio-helper">登录云端空间并连接模型后，可以使用 AI 节点设计助手；手动设计始终可用。</p>
              ) : aiLoadStatus === "ready" && !connectedAi ? (
                <p className="node-studio-helper">请先在“AI 接入”中连接一个可用模型服务。</p>
              ) : null}
            </div>
          </section>

          {(feedbackError || feedbackNotice) && (
            <div
              className={`node-studio-feedback ${feedbackError ? "is-error" : "is-success"}`}
              role={feedbackError ? "alert" : "status"}
              aria-live="polite"
            >
              <StudioIcon name={feedbackError ? "close" : "check"} />
              <span>{feedbackError ?? feedbackNotice}</span>
              <button type="button" aria-label="关闭提示" onClick={clearLocalFeedback}>
                <StudioIcon name="close" />
              </button>
            </div>
          )}

          <div className="node-studio-workspace">
            <div className="node-studio-form-card">
              <div className="node-studio-tabs" role="tablist" aria-label="节点设计步骤">
                <EditorTabButton tab="definition" active={tab} onSelect={setTab} index="01" label="定义" />
                <EditorTabButton tab="interface" active={tab} onSelect={setTab} index="02" label="接口与能力" />
                <EditorTabButton tab="logic" active={tab} onSelect={setTab} index="03" label="逻辑与测试" />
              </div>

              <div className="node-studio-tab-panel" role="tabpanel">
                {tab === "definition" && (
                  <DefinitionEditor draft={draft} onChange={setDraft} />
                )}
                {tab === "interface" && (
                  <InterfaceEditor
                    draft={draft}
                    onChange={setDraft}
                    bindings={bindings}
                    onBindingsChange={setBindings}
                    connections={httpConnections}
                    connectionsLoading={httpConnectionLoadStatus === "loading"}
                  />
                )}
                {tab === "logic" && (
                  <LogicEditor draft={draft} onChange={setDraft} />
                )}
              </div>
            </div>

            <aside className="node-studio-inspection" aria-label="节点规则检查">
              <section className="node-studio-preview-card">
                <span className="node-studio-preview-label">节点预览</span>
                <div className="node-studio-node-preview">
                  <div className="node-studio-node-preview-topline" />
                  <div className="node-studio-node-preview-heading">
                    <span><StudioIcon name="node" /></span>
                    <div>
                      <strong>{draft.name || "未命名节点"}</strong>
                      <small>{CATEGORY_OPTIONS.find((item) => item.value === draft.category)?.label}</small>
                    </div>
                  </div>
                  <p>{draft.description || "补充一句清晰的能力说明"}</p>
                  <div className="node-studio-port-summary">
                    <span>{draft.ports.inputs.length} 个输入</span>
                    <i />
                    <span>{draft.ports.outputs.length} 个输出</span>
                  </div>
                </div>
              </section>

              <section className="node-studio-rules-card">
                <div className="node-studio-section-title compact">
                  <div>
                    <h2>规则检查</h2>
                    <p>{issues.length === 0 ? "草案符合节点对象协议" : `${issues.length} 项需要处理`}</p>
                  </div>
                  <span className={`node-studio-rule-indicator ${issues.length === 0 ? "is-valid" : ""}`}>
                    {issues.length === 0 ? <StudioIcon name="check" /> : issues.length}
                  </span>
                </div>
                {issues.length === 0 ? (
                  <ul className="node-studio-rule-list is-valid">
                    <li><StudioIcon name="check" /> 输入输出声明完整</li>
                    <li><StudioIcon name="check" /> 实现没有越过能力边界</li>
                    <li><StudioIcon name="check" /> 测试覆盖正常与边界情况</li>
                  </ul>
                ) : (
                  <ul className="node-studio-rule-list">
                    {issues.slice(0, 6).map((issue, index) => (
                      <li key={`${issue.path}-${index}`}>
                        <span>{index + 1}</span>
                        <div><strong>{issue.path}</strong>{issue.message}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {selectedPackage?.testReport && (
                <section className="node-studio-test-card">
                  <div className="node-studio-section-title compact">
                    <div>
                      <h2>最近测试</h2>
                      <p>{selectedPackage.testReport.passed ? "全部通过" : "存在失败项"}</p>
                    </div>
                    <span className={`node-studio-rule-indicator ${selectedPackage.testReport.passed ? "is-valid" : ""}`}>
                      {selectedPackage.testReport.results.filter((item) => item.passed).length}/
                      {selectedPackage.testReport.results.length}
                    </span>
                  </div>
                  <ul>
                    {selectedPackage.testReport.results.map((result) => (
                      <li key={result.name} data-passed={result.passed}>
                        <span>{result.passed ? <StudioIcon name="check" /> : <StudioIcon name="close" />}</span>
                        <div><strong>{result.name}</strong><small>{result.message} · {result.durationMs}ms</small></div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>
        </div>

        <footer className="node-studio-actions">
          <div className="node-studio-draft-state">
            <span className={dirty ? "is-dirty" : ""} />
            {selectedPackage
              ? dirty ? "有未保存的修改" : `类型 ID：${selectedPackage.id}`
              : dirty ? "新节点尚未保存" : "准备创建新节点"}
          </div>
          <div>
            {selectedPackage?.activeRevision && selectedPackage.lifecycle !== "disabled" && (
              <button
                type="button"
                className="node-studio-button danger"
                disabled={busy !== null}
                onClick={handleDisable}
              >
                <StudioIcon name="power" />停用
              </button>
            )}
            <button
              type="button"
              className="node-studio-button"
              disabled={busy !== null || !dirty && Boolean(selectedPackage)}
              onClick={() => void handleSave()}
            >
              <StudioIcon name="save" />
              {busy === "save" ? "保存中…" : "保存草稿"}
            </button>
            <button
              type="button"
              className="node-studio-button"
              disabled={busy !== null || issues.length > 0}
              onClick={() => void handleTest()}
            >
              <StudioIcon name="play" />
              {busy === "test" ? "测试中…" : "运行测试"}
            </button>
            <button
              type="button"
              className="node-studio-primary-button"
              disabled={busy !== null || issues.length > 0}
              onClick={() => void handleActivate()}
            >
              <StudioIcon name="check" />
              {busy === "activate" ? "正在启用…" : selectedPackage?.activeRevision ? "发布新版本" : "启用到画布"}
            </button>
          </div>
        </footer>
      </main>
    </section>
  );
}

function EditorTabButton({
  tab,
  active,
  onSelect,
  index,
  label,
}: {
  tab: EditorTab;
  active: EditorTab;
  onSelect: (tab: EditorTab) => void;
  index: string;
  label: string;
}) {
  const selected = tab === active;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={selected ? "is-selected" : ""}
      onClick={() => onSelect(tab)}
    >
      <span>{index}</span>{label}
    </button>
  );
}

function Field({
  label,
  helper,
  children,
  wide = false,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`node-studio-field ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}

function DefinitionEditor({
  draft,
  onChange,
}: {
  draft: CustomNodeDraft;
  onChange: (draft: CustomNodeDraft) => void;
}) {
  return (
    <div className="node-studio-editor-section">
      <div className="node-studio-section-heading">
        <span>01</span>
        <div><h2>定义节点身份</h2><p>名称表达它是什么，说明表达它真正能完成什么。</p></div>
      </div>
      <div className="node-studio-field-grid">
        <Field label="节点名称" helper={`${draft.name.length}/40`}>
          <input
            value={draft.name}
            maxLength={40}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label="稳定标识" helper="保存后类型 ID 保持稳定">
          <input
            value={draft.slug}
            spellCheck={false}
            onChange={(event) => onChange({
              ...draft,
              slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            })}
          />
        </Field>
        <Field label="能力说明" helper={`${draft.description.length}/160`} wide>
          <textarea
            value={draft.description}
            maxLength={160}
            rows={3}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
          />
        </Field>
        <Field label="节点类别">
          <select
            value={draft.category}
            onChange={(event) => onChange({
              ...draft,
              category: event.target.value as CustomNodeDraft["category"],
            })}
          >
            {CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="图标语义">
          <select
            value={draft.icon}
            onChange={(event) => onChange({ ...draft, icon: event.target.value })}
          >
            {ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function InterfaceEditor({
  draft,
  onChange,
  bindings,
  onBindingsChange,
  connections,
  connectionsLoading,
}: {
  draft: CustomNodeDraft;
  onChange: (draft: CustomNodeDraft) => void;
  bindings: Record<string, string>;
  onBindingsChange: (bindings: Record<string, string>) => void;
  connections: HttpConnection[];
  connectionsLoading: boolean;
}) {
  return (
    <div className="node-studio-editor-section">
      <div className="node-studio-section-heading">
        <span>02</span>
        <div><h2>声明接口与能力</h2><p>节点只能读取声明过的输入，并通过申请过的能力接触外部世界。</p></div>
      </div>
      <PortEditor
        title="输入端口"
        direction="inputs"
        ports={draft.ports.inputs}
        onChange={(ports) => onChange({ ...draft, ports: { ...draft.ports, inputs: ports } })}
      />
      <PortEditor
        title="输出端口"
        direction="outputs"
        ports={draft.ports.outputs}
        onChange={(ports) => onChange({ ...draft, ports: { ...draft.ports, outputs: ports } })}
      />
      <ConfigEditor
        schema={draft.configSchema}
        onChange={(configSchema) => onChange({ ...draft, configSchema })}
      />
      <CapabilityEditor
        capabilities={draft.capabilities}
        onChange={(capabilities) => onChange({ ...draft, capabilities })}
      />
      <ConnectionBindingEditor
        capabilities={draft.capabilities}
        bindings={bindings}
        onChange={onBindingsChange}
        connections={connections}
        loading={connectionsLoading}
      />
    </div>
  );
}

function PortEditor({
  title,
  direction,
  ports,
  onChange,
}: {
  title: string;
  direction: "inputs" | "outputs";
  ports: PortSpec[];
  onChange: (ports: PortSpec[]) => void;
}) {
  function update(index: number, patch: Partial<PortSpec>) {
    onChange(ports.map((port, portIndex) => portIndex === index ? { ...port, ...patch } : port));
  }
  function add() {
    const prefix = direction === "inputs" ? "in" : "out";
    let index = ports.length + 1;
    while (ports.some((port) => port.id === `${prefix}${index}`)) index += 1;
    onChange([...ports, {
      id: `${prefix}${index}`,
      name: `端口 ${index}`,
      dataType: "any",
      capacity: direction === "outputs" ? "many" : "one",
    }]);
  }
  return (
    <section className="node-studio-subsection">
      <div className="node-studio-subsection-title">
        <div><h3>{title}</h3><span>{ports.length}/8</span></div>
        <button type="button" onClick={add}><StudioIcon name="plus" />添加端口</button>
      </div>
      <div className="node-studio-row-list">
        {ports.map((port, index) => (
          <div className="node-studio-port-row" key={`${direction}-${index}`}>
            <span className={`node-studio-port-dot is-${direction}`} />
            <input
              aria-label={`${title}名称 ${index + 1}`}
              value={port.name}
              placeholder="显示名称"
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <input
              aria-label={`${title}标识 ${index + 1}`}
              value={port.id}
              placeholder="port_id"
              spellCheck={false}
              onChange={(event) => update(index, {
                id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
              })}
            />
            <select
              aria-label={`${title}数据类型 ${index + 1}`}
              value={port.dataType ?? "any"}
              onChange={(event) => update(index, { dataType: event.target.value })}
            >
              {DATA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            {direction === "outputs" ? (
              <select
                aria-label={`${title}连接容量 ${index + 1}`}
                value={port.capacity ?? "many"}
                onChange={(event) => update(index, {
                  capacity: event.target.value as PortSpec["capacity"],
                })}
              >
                <option value="many">多下游</option>
                <option value="one">单下游</option>
              </select>
            ) : (
              <span className="node-studio-port-capacity">单上游</span>
            )}
            <button
              type="button"
              aria-label={`删除${port.name || title}`}
              className="node-studio-row-remove"
              onClick={() => onChange(ports.filter((_, portIndex) => portIndex !== index))}
            >
              <StudioIcon name="close" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigEditor({
  schema,
  onChange,
}: {
  schema: JSONSchema;
  onChange: (schema: JSONSchema) => void;
}) {
  const properties = schema.properties ?? {};
  const entries = Object.entries(properties);
  const required = new Set(schema.required ?? []);

  function replaceProperties(next: Record<string, JSONSchema>, nextRequired = [...required]) {
    onChange({ ...schema, type: "object", properties: next, required: nextRequired });
  }
  function add() {
    let index = entries.length + 1;
    while (`field${index}` in properties) index += 1;
    replaceProperties({
      ...properties,
      [`field${index}`]: { type: "string", title: `配置 ${index}`, default: "" },
    });
  }
  function rename(previous: string, next: string) {
    if (!next || next === previous || next in properties) return;
    const renamed = Object.fromEntries(entries.map(([key, value]) => [key === previous ? next : key, value]));
    replaceProperties(renamed, [...required].map((key) => key === previous ? next : key));
  }
  return (
    <section className="node-studio-subsection">
      <div className="node-studio-subsection-title">
        <div><h3>用户配置</h3><span>这些字段会自动生成节点配置表单</span></div>
        <button type="button" onClick={add}><StudioIcon name="plus" />添加配置</button>
      </div>
      {entries.length === 0 ? (
        <div className="node-studio-inline-empty">这个节点不需要用户配置。</div>
      ) : (
        <div className="node-studio-row-list">
          {entries.map(([key, field], index) => (
            <div className="node-studio-config-row" key={key}>
              <input
                aria-label={`配置名称 ${index + 1}`}
                value={field.title ?? ""}
                placeholder="显示名称"
                onChange={(event) => replaceProperties({
                  ...properties,
                  [key]: { ...field, title: event.target.value },
                })}
              />
              <ConfigKeyInput
                value={key}
                label={`配置标识 ${index + 1}`}
                onCommit={(next) => rename(key, next)}
              />
              <select
                aria-label={`配置类型 ${index + 1}`}
                value={field.type ?? "string"}
                onChange={(event) => replaceProperties({
                  ...properties,
                  [key]: { ...field, type: event.target.value as JSONSchema["type"] },
                })}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <label className="node-studio-checkbox">
                <input
                  type="checkbox"
                  checked={required.has(key)}
                  onChange={(event) => replaceProperties(
                    properties,
                    event.target.checked
                      ? [...required, key]
                      : [...required].filter((item) => item !== key),
                  )}
                />
                必填
              </label>
              <button
                type="button"
                className="node-studio-row-remove"
                aria-label={`删除配置 ${field.title ?? key}`}
                onClick={() => {
                  const next = { ...properties };
                  delete next[key];
                  replaceProperties(next, [...required].filter((item) => item !== key));
                }}
              >
                <StudioIcon name="close" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ConfigKeyInput({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label}
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(
        event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      )}
      onBlur={() => {
        if (draft) onCommit(draft);
        else setDraft(value);
      }}
    />
  );
}

function CapabilityEditor({
  capabilities,
  onChange,
}: {
  capabilities: CustomNodeCapabilityRequest[];
  onChange: (capabilities: CustomNodeCapabilityRequest[]) => void;
}) {
  function add() {
    let index = capabilities.length + 1;
    while (capabilities.some((item) => item.key === `ability${index}`)) index += 1;
    onChange([...capabilities, {
      key: `ability${index}`,
      carrier: "app",
      actions: ["execute"],
      reason: "说明为什么这个节点需要访问外部能力",
    }]);
  }
  function update(index: number, patch: Partial<CustomNodeCapabilityRequest>) {
    onChange(capabilities.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }
  return (
    <section className="node-studio-subsection capability">
      <div className="node-studio-subsection-title">
        <div><h3>外部能力申请</h3><span>网络、应用、AI 和数据访问都必须在这里声明</span></div>
        <button type="button" onClick={add}><StudioIcon name="plus" />申请能力</button>
      </div>
      {capabilities.length === 0 ? (
        <div className="node-studio-inline-empty secure">
          <StudioIcon name="check" />纯处理节点，不接触任何外部系统。
        </div>
      ) : (
        <div className="node-studio-row-list">
          {capabilities.map((capability, index) => (
            <div className="node-studio-capability-row" key={`${capability.key}-${index}`}>
              <input
                aria-label={`能力标识 ${index + 1}`}
                value={capability.key}
                spellCheck={false}
                onChange={(event) => update(index, {
                  key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                })}
              />
              <select
                aria-label={`能力载体 ${index + 1}`}
                value={capability.carrier}
                onChange={(event) => update(index, {
                  carrier: event.target.value as CustomNodeCapabilityRequest["carrier"],
                })}
              >
                <option value="app">应用</option>
                <option value="ai">AI</option>
                <option value="data">数据</option>
              </select>
              <input
                aria-label={`允许动作 ${index + 1}`}
                value={capability.actions.join(", ")}
                placeholder="read, write"
                onChange={(event) => update(index, {
                  actions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                })}
              />
              <input
                aria-label={`申请原因 ${index + 1}`}
                value={capability.reason}
                placeholder="说明用途"
                onChange={(event) => update(index, { reason: event.target.value })}
              />
              <button
                type="button"
                className="node-studio-row-remove"
                aria-label={`删除能力 ${capability.key}`}
                onClick={() => onChange(capabilities.filter((_, itemIndex) => itemIndex !== index))}
              >
                <StudioIcon name="close" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ConnectionBindingEditor({
  capabilities,
  bindings,
  onChange,
  connections,
  loading,
}: {
  capabilities: CustomNodeCapabilityRequest[];
  bindings: Record<string, string>;
  onChange: (bindings: Record<string, string>) => void;
  connections: HttpConnection[];
  loading: boolean;
}) {
  const [showManager, setShowManager] = useState(false);
  const appCapabilities = capabilities.filter((capability) => capability.carrier === "app");

  function bind(capabilityKey: string, connectionId: string) {
    const next = { ...bindings };
    if (connectionId) next[capabilityKey] = connectionId;
    else delete next[capabilityKey];
    onChange(next);
  }

  return (
    <section className="node-studio-subsection node-studio-connections">
      <div className="node-studio-subsection-title">
        <div>
          <h3>接口连接与授权</h3>
          <span>节点只保存连接引用；密钥不会写进节点、工作流或磁盘</span>
        </div>
        <button type="button" onClick={() => setShowManager((value) => !value)}>
          <StudioIcon name="plus" />{showManager ? "收起连接" : "管理连接"}
        </button>
      </div>
      {appCapabilities.length === 0 ? (
        <div className="node-studio-inline-empty secure">
          <StudioIcon name="check" />此节点没有申请应用/HTTP 能力，无需绑定外部连接。
        </div>
      ) : (
        <div className="node-studio-connection-bindings">
          {appCapabilities.map((capability) => {
            const selectedId = bindings[capability.key] ?? "";
            const selected = connections.find((connection) => connection.id === selectedId);
            return (
              <label key={capability.key} className="node-studio-connection-binding">
                <span>
                  <strong>{capability.key}</strong>
                  <small>{capability.reason}</small>
                </span>
                <select
                  aria-label={`为能力 ${capability.key} 选择接口连接`}
                  value={selectedId}
                  disabled={loading}
                  onChange={(event) => bind(capability.key, event.target.value)}
                >
                  <option value="">选择一个接口连接…</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>{connection.name}</option>
                  ))}
                </select>
                <em className={selected?.auth ? "is-session" : ""}>
                  {selected
                    ? selected.auth ? "密钥仅本次会话" : "无需密钥"
                    : "启用前必须绑定"}
                </em>
              </label>
            );
          })}
        </div>
      )}
      {showManager && <HttpConnectionManager />}
    </section>
  );
}

function HttpConnectionManager() {
  const connections = useHttpConnectionStore((state) => state.connections);
  const storeError = useHttpConnectionStore((state) => state.error);
  const save = useHttpConnectionStore((state) => state.save);
  const remove = useHttpConnectionStore((state) => state.remove);
  const hasSessionSecret = useHttpConnectionStore((state) => state.hasSessionSecret);
  const clearError = useHttpConnectionStore((state) => state.clearError);
  const [draft, setDraft] = useState<HttpConnectionDraft>(() => createHttpConnectionDraft());
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function startNew() {
    clearError();
    setDraft(createHttpConnectionDraft());
    setSecret("");
    setNotice(null);
    setLocalError(null);
  }

  function edit(connection: HttpConnection) {
    clearError();
    setDraft({
      id: connection.id,
      name: connection.name,
      baseUrl: connection.baseUrl,
      allowedPathPrefixes: connection.allowedPathPrefixes,
      allowedMethods: connection.allowedMethods,
      auth: connection.auth,
    });
    setSecret("");
    setNotice(null);
    setLocalError(null);
  }

  async function saveConnection() {
    setBusy(true);
    setNotice(null);
    setLocalError(null);
    try {
      const connection = await save(draft, secret);
      edit(connection);
      setNotice(connection.auth && !secret.trim() && !hasSessionSecret(connection.id)
        ? "连接已保存；运行前请在本次会话填写密钥。"
        : "接口连接已保存。密钥只在本次会话有效。");
    } catch (error) {
      setLocalError(formatProductErrorMessage(error, "接口连接没有保存。"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteConnection(id: string) {
    const connection = connections.find((item) => item.id === id);
    if (!connection || !window.confirm(`删除接口连接“${connection.name}”？已绑定它的节点需要重新选择连接。`)) return;
    await remove(id);
    if (draft.id === id) startNew();
  }

  return (
    <div className="node-studio-connection-manager">
      <div className="node-studio-connection-manager-copy">
        <strong>我的 HTTP 连接</strong>
        <p>连接限制了可访问的地址、路径和方法；认证密钥只保留在当前桌面会话内。</p>
      </div>
      <div className="node-studio-connection-list" aria-label="已保存的接口连接">
        {connections.length === 0 ? (
          <span>尚未创建接口连接。</span>
        ) : connections.map((connection) => (
          <div key={connection.id}>
            <button type="button" onClick={() => edit(connection)}>
              <strong>{connection.name}</strong>
              <small>{connection.baseUrl}</small>
            </button>
            <span className={connection.auth && hasSessionSecret(connection.id) ? "is-connected" : ""}>
              {connection.auth
                ? hasSessionSecret(connection.id) ? "本次会话已授权" : "需要密钥"
                : "无认证"}
            </span>
            <button
              type="button"
              className="node-studio-row-remove"
              aria-label={`删除接口连接 ${connection.name}`}
              onClick={() => void deleteConnection(connection.id)}
            ><StudioIcon name="close" /></button>
          </div>
        ))}
      </div>
      <div className="node-studio-connection-form">
        <div className="node-studio-field-grid">
          <Field label="连接名称">
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="可信根地址" helper="例如 https://api.example.com/v1">
            <input value={draft.baseUrl} spellCheck={false} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} />
          </Field>
          <Field label="允许的方法" helper="逗号分隔，例如 GET, POST">
            <input
              value={draft.allowedMethods.join(", ")}
              spellCheck={false}
              onChange={(event) => setDraft({
                ...draft,
                allowedMethods: event.target.value.split(",").map((value) => value.trim().toUpperCase())
                  .filter((value): value is typeof HTTP_METHODS[number] => HTTP_METHODS.includes(value as typeof HTTP_METHODS[number])),
              })}
            />
          </Field>
          <Field label="允许路径前缀" helper="留空表示可信根地址下的全部路径">
            <input
              value={draft.allowedPathPrefixes.join(", ")}
              spellCheck={false}
              placeholder="customers, orders"
              onChange={(event) => setDraft({
                ...draft,
                allowedPathPrefixes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
              })}
            />
          </Field>
        </div>
        <label className="node-studio-checkbox node-studio-auth-toggle">
          <input
            type="checkbox"
            checked={Boolean(draft.auth)}
            onChange={(event) => setDraft({
              ...draft,
              auth: event.target.checked
                ? { headerName: "Authorization", valuePrefix: "Bearer" }
                : undefined,
            })}
          />
          这个接口需要认证密钥
        </label>
        {draft.auth && (
          <div className="node-studio-field-grid node-studio-auth-fields">
            <Field label="认证请求头">
              <input
                value={draft.auth.headerName}
                spellCheck={false}
                onChange={(event) => setDraft({ ...draft, auth: { ...draft.auth!, headerName: event.target.value } })}
              />
            </Field>
            <Field label="认证前缀" helper="Bearer 等；留空则原样发送">
              <input
                value={draft.auth.valuePrefix}
                spellCheck={false}
                onChange={(event) => setDraft({ ...draft, auth: { ...draft.auth!, valuePrefix: event.target.value } })}
              />
            </Field>
            <Field label="本次会话密钥" helper={draft.id && hasSessionSecret(draft.id) ? "已授权；留空可保留本次会话的密钥" : "不会保存到磁盘"} wide>
              <input
                type="password"
                value={secret}
                autoComplete="off"
                placeholder="粘贴 API Key 或 Token"
                onChange={(event) => setSecret(event.target.value)}
              />
            </Field>
          </div>
        )}
        {(storeError || localError || notice) && (
          <p className={`node-studio-connection-feedback ${storeError || localError ? "is-error" : ""}`} role={storeError || localError ? "alert" : "status"}>
            {storeError ?? localError ?? notice}
          </p>
        )}
        <div className="node-studio-connection-actions">
          <button type="button" className="node-studio-button" onClick={startNew} disabled={busy}>新建连接</button>
          <button type="button" className="node-studio-primary-button" onClick={() => void saveConnection()} disabled={busy}>
            <StudioIcon name="save" />{busy ? "保存中…" : draft.id ? "更新连接" : "保存连接"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogicEditor({
  draft,
  onChange,
}: {
  draft: CustomNodeDraft;
  onChange: (draft: CustomNodeDraft) => void;
}) {
  function updateTest(index: number, patch: Partial<CustomNodeTestCase>) {
    onChange({
      ...draft,
      tests: draft.tests.map((test, testIndex) => testIndex === index ? { ...test, ...patch } : test),
    });
  }
  function addTest() {
    onChange({
      ...draft,
      tests: [...draft.tests, {
        name: `边界测试 ${draft.tests.length + 1}`,
        kind: "boundary",
        input: {},
        expected: { outputs: Object.fromEntries(draft.ports.outputs.map((port) => [port.id, null])) },
      }],
    });
  }
  return (
    <div className="node-studio-editor-section">
      <div className="node-studio-section-heading">
        <span>03</span>
        <div><h2>实现逻辑并验证</h2><p>节点代码在一次性 Worker 中运行；HTTP 访问只能经过已授权的连接。</p></div>
      </div>
      <section className="node-studio-subsection">
        <div className="node-studio-subsection-title">
          <div><h3>受限 JavaScript</h3><span>可用：input、config、invoke、log、signal</span></div>
          <span className="node-studio-code-limit">{draft.implementation.source.length}/20000</span>
        </div>
        <textarea
          className="node-studio-code-editor"
          aria-label="节点执行逻辑"
          spellCheck={false}
          value={draft.implementation.source}
          onChange={(event) => onChange({
            ...draft,
            implementation: { ...draft.implementation, source: event.target.value },
          })}
        />
      </section>
      <section className="node-studio-subsection">
        <div className="node-studio-subsection-title">
          <div><h3>测试样例</h3><span>至少包含一个正常情况和一个边界或错误情况</span></div>
          <button type="button" onClick={addTest}><StudioIcon name="plus" />添加测试</button>
        </div>
        <div className="node-studio-tests-editor">
          {draft.tests.map((test, index) => (
            <article key={`${test.name}-${index}`}>
              <div className="node-studio-test-heading">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input
                  aria-label={`测试名称 ${index + 1}`}
                  value={test.name}
                  onChange={(event) => updateTest(index, { name: event.target.value })}
                />
                <select
                  aria-label={`测试类型 ${index + 1}`}
                  value={test.kind}
                  onChange={(event) => updateTest(index, {
                    kind: event.target.value as CustomNodeTestCase["kind"],
                  })}
                >
                  <option value="happy">正常</option>
                  <option value="boundary">边界</option>
                  <option value="error">错误</option>
                </select>
                <button
                  type="button"
                  className="node-studio-row-remove"
                  aria-label={`删除测试 ${test.name}`}
                  disabled={draft.tests.length <= 2}
                  onClick={() => onChange({
                    ...draft,
                    tests: draft.tests.filter((_, testIndex) => testIndex !== index),
                  })}
                >
                  <StudioIcon name="close" />
                </button>
              </div>
              <div className="node-studio-test-fields">
                <JsonEditor
                  label="输入 JSON"
                  value={test.input}
                  onChange={(input) => updateTest(index, { input })}
                />
                {test.kind === "error" ? (
                  <Field label="预期错误码">
                    <input
                      value={test.expected.errorCode ?? ""}
                      onChange={(event) => updateTest(index, {
                        expected: { errorCode: event.target.value },
                      })}
                    />
                  </Field>
                ) : (
                  <JsonEditor
                    label="预期 outputs"
                    value={test.expected.outputs ?? {}}
                    onChange={(outputs) => updateTest(index, {
                      expected: { outputs: outputs as Record<string, unknown> },
                    })}
                  />
                )}
                {draft.capabilities.length > 0 && (
                  <JsonEditor
                    label="能力模拟 mocks"
                    value={test.mocks ?? []}
                    wide
                    onChange={(mocks) => updateTest(index, {
                      mocks: Array.isArray(mocks)
                        ? mocks as CustomNodeTestCase["mocks"]
                        : [],
                    })}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function JsonEditor({
  label,
  value,
  onChange,
  wide = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  wide?: boolean;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(serialized), [serialized]);

  function commit() {
    try {
      onChange(JSON.parse(text));
      setError(null);
    } catch {
      setError("JSON 格式不正确");
    }
  }

  return (
    <label className={`node-studio-json-field ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <textarea
        value={text}
        spellCheck={false}
        rows={5}
        aria-invalid={Boolean(error)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
