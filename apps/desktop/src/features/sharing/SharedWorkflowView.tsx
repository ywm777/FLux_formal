import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SharedWorkflow } from "@flux/shared";
import { safeParseGraph } from "@flux/workflow-schema";
import { registry } from "../../lib/registry.js";
import { formatProductErrorMessage } from "../../lib/productError.js";
import { useSharingService } from "../../app/WorkspaceServiceProvider.js";
import type { AuthStatus } from "../../store/authStore.js";
import { FluxNode, type FluxNodeData } from "../canvas/FluxNode.js";
import { fromWorkflowGraph } from "../canvas/graphBridge.js";
import { buildNodeBusinessPresentation } from "../canvas/nodeBusinessSurface.js";

interface SharedWorkflowViewProps {
  shareId: string;
  authStatus: AuthStatus;
  onRequestLogin: () => void;
  onCopied: (workflowId: string) => void;
  onBack: () => void;
}

export function SharedWorkflowView({
  shareId,
  authStatus,
  onRequestLogin,
  onCopied,
  onBack,
}: SharedWorkflowViewProps) {
  const sharingService = useSharingService();
  const [workflow, setWorkflow] = useState<SharedWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWorkflow(null);
    setError(null);
    void sharingService
      .getShared(shareId)
      .then((result) => {
        if (!cancelled) setWorkflow(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(formatProductErrorMessage(reason, "分享链接不存在或已失效"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId, sharingService]);

  const preview = useMemo(() => {
    if (!workflow) return null;
    const parsed = safeParseGraph(workflow.graph);
    if (!parsed.success) return { invalid: true as const, nodes: [], edges: [] };

    const converted = fromWorkflowGraph(parsed.data);
    const order = compileExecutionOrder(converted.nodes, converted.edges);
    const stepById = new Map(order.map((nodeId, index) => [nodeId, index + 1]));
    const nodes = converted.nodes.map((node): Node<FluxNodeData> => {
      const definition = registry.resolve(node.data.fluxType);
      const presentation = definition
        ? buildNodeBusinessPresentation(definition)
        : undefined;
      return {
        ...node,
        selectable: false,
        draggable: false,
        data: {
          ...node.data,
          executionStep: stepById.get(node.id),
          allowHoverToolbar: false,
          presentation: presentation
            ? { ...presentation, controls: [], payload: undefined }
            : undefined,
          actions: undefined,
        },
      };
    });
    const edges = converted.edges.map((edge): Edge => {
      const isError = edge.data?.route === "error";
      return {
        ...edge,
        selectable: false,
        type: "smoothstep",
        label: `${stepById.get(edge.source) ?? "?"} → ${stepById.get(edge.target) ?? "?"}`,
        labelStyle: {
          fill: isError ? "var(--danger)" : "var(--text-secondary)",
          fontSize: 10,
          fontWeight: 650,
        },
        labelBgStyle: {
          fill: "var(--bg-base)",
          fillOpacity: 0.94,
        },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 3,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isError ? "var(--danger)" : "var(--accent)",
          width: 14,
          height: 14,
        },
        style: {
          stroke: isError ? "var(--danger)" : "var(--accent)",
          strokeWidth: 1.45,
        },
      };
    });
    return { invalid: false as const, nodes, edges };
  }, [workflow]);

  async function copyToWorkbench() {
    if (authStatus !== "authenticated") {
      onRequestLogin();
      return;
    }
    setCopying(true);
    setError(null);
    try {
      const copied = await sharingService.copyShared(shareId);
      onCopied(copied.id);
    } catch (reason) {
      setError(formatProductErrorMessage(reason, "复制工作流失败"));
    } finally {
      setCopying(false);
    }
  }

  return (
    <section className="shared-workflow-page" aria-label="共享工作流">
      <header className="shared-workflow-toolbar">
        <button
          type="button"
          className="shared-workflow-back"
          onClick={onBack}
          aria-label="返回 Flux"
          title="返回 Flux"
        >
          <BackIcon />
        </button>

        <div className="shared-workflow-identity">
          <div className="shared-workflow-title-row">
            <span className="shared-workflow-readonly">只读</span>
            <h1>{workflow?.title ?? (loading ? "正在打开共享流程" : "共享流程")}</h1>
          </div>
          {workflow && preview && !preview.invalid ? (
            <p>
              {preview.nodes.length} 个节点 · {preview.edges.length} 条连线 · 更新于 {formatDate(workflow.updatedAt)}
            </p>
          ) : null}
        </div>

        <div className="shared-workflow-toolbar-spacer" />
        {!loading && workflow && preview && !preview.invalid ? (
          <button
            type="button"
            className="shared-workflow-copy-action"
            aria-label={
              authStatus === "authenticated"
                ? "复制到工作台"
                : "登录后复制"
            }
            disabled={copying || authStatus === "loading"}
            onClick={() => void copyToWorkbench()}
          >
            <CopyFlowIcon />
            <span className="shared-workflow-copy-label">
              {copying
                ? "正在复制"
                : authStatus === "authenticated"
                  ? "复制到工作台"
                  : "登录后复制"}
            </span>
          </button>
        ) : null}
      </header>

      <div className="shared-workflow-stage">
        {loading ? (
          <div className="shared-workflow-status" role="status">
            <span className="shared-workflow-status-spinner" aria-hidden="true" />
            <strong>正在加载工作流</strong>
          </div>
        ) : error && !workflow ? (
          <div className="shared-workflow-status" role="alert">
            <InvalidLinkIcon />
            <strong>无法打开这个分享链接</strong>
            <span>{error}</span>
            <button type="button" onClick={onBack}>返回 Flux</button>
          </div>
        ) : preview?.invalid ? (
          <div className="shared-workflow-status" role="alert">
            <InvalidLinkIcon />
            <strong>流程数据无法预览</strong>
            <span>分享者需要先在画布中重新保存此工作流。</span>
          </div>
        ) : preview ? (
          <ReactFlow
            className="shared-workflow-canvas"
            nodes={preview.nodes}
            edges={preview.edges}
            nodeTypes={{ flux: FluxNode }}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1.1 }}
            minZoom={0.12}
            maxZoom={2.4}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
        ) : null}

        {error && workflow ? (
          <div className="shared-workflow-inline-error" role="alert">{error}</div>
        ) : null}
      </div>
    </section>
  );
}

function compileExecutionOrder(
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
): string[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const nextById = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    nextById.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;
    order.push(nodeId);
    for (const nextId of nextById.get(nodeId) ?? []) {
      const degree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, degree);
      if (degree === 0) queue.push(nextId);
    }
  }
  return order.length === nodes.length ? order : nodes.map((node) => node.id);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m9.8 3.5-4.5 4.5 4.5 4.5M5.8 8h6.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" />
    </svg>
  );
}

function CopyFlowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5" y="5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3 10.5V4.4C3 3.6 3.6 3 4.4 3h6.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
    </svg>
  );
}

function InvalidLinkIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M12.5 19.5 19.5 12.5M11 22H8.5a6.5 6.5 0 0 1 0-13H13m6 0h4.5a6.5 6.5 0 0 1 0 13H19" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="m8 8 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}
