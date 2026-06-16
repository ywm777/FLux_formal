import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { registry, builtinNodes } from "../../lib/registry.js";
import { runExecution } from "../../lib/api.js";
import { useAppStore } from "../../store/appStore.js";
import { FluxNode, type FluxNodeData } from "./FluxNode.js";
import { createFluxNode, toWorkflowGraph } from "./graphBridge.js";

let counter = 0;
const nextId = () => `n${++counter}`;

function seedNodes(): Node<FluxNodeData>[] {
  const trigger = registry.resolve("flux.trigger.manual")!;
  const log = registry.resolve("flux.action.log")!;
  return [
    createFluxNode(trigger, { x: 80, y: 160 }, nextId()),
    createFluxNode(log, { x: 360, y: 160 }, nextId()),
  ];
}

export function CanvasView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FluxNodeData>>(
    seedNodes(),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const running = useAppStore((s) => s.running);
  const setRunning = useAppStore((s) => s.setRunning);
  const setLastExecution = useAppStore((s) => s.setLastExecution);

  const nodeTypes = useMemo(() => ({ flux: FluxNode }), []);

  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge(conn, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (type: string) => {
      const def = registry.resolve(type);
      if (!def) return;
      const pos = { x: 120 + Math.random() * 280, y: 120 + Math.random() * 200 };
      setNodes((ns) => [...ns, createFluxNode(def, pos, nextId())]);
    },
    [setNodes],
  );

  const onRun = useCallback(async () => {
    setError(null);
    setRunning(true);
    try {
      const graph = toWorkflowGraph(
        "wf_canvas",
        nodes,
        edges,
        { x: 0, y: 0, zoom: 1 },
        "画布工作流",
      );
      const result = await runExecution(graph.id, graph);
      setLastExecution(result);
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }, [nodes, edges, setRunning, setLastExecution]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        colorMode="dark"
        minZoom={0.1}
        maxZoom={4}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      <div style={toolbarStyle}>
        {builtinNodes.map((def) => (
          <button key={def.id} style={btn} onClick={() => addNode(def.id)}>
            + {def.name}
          </button>
        ))}
        <div style={{ width: 1, background: "var(--border-subtle)", margin: "0 4px" }} />
        <button style={runBtn} onClick={onRun} disabled={running}>
          {running ? "运行中…" : "▶ 运行"}
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  right: 16,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: 6,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-popover)",
  zIndex: 100,
};

const btn: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  padding: "var(--space-1) var(--space-2)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const runBtn: React.CSSProperties = {
  ...btn,
  background: "var(--accent)",
  color: "var(--text-inverse)",
  border: "none",
  fontWeight: 600,
};

const errorStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 64,
  right: 16,
  padding: "var(--space-2) var(--space-3)",
  background: "var(--danger-subtle)",
  color: "var(--danger)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)",
  zIndex: 100,
};
