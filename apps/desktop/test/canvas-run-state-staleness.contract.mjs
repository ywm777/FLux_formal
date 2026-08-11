import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);

const requirements = [
  [
    "canvas distinguishes execution-affecting node changes from layout-only movement",
    /function isExecutionAffectingNodeChange\([\s\S]*change\.type !== "position"[\s\S]*change\.type !== "select"[\s\S]*change\.type !== "dimensions"/,
  ],
  [
    "canvas clears stale run state through a named semantic-change helper",
    /const clearStaleRunState = useCallback\(function clearStaleRunState\(\) \{[\s\S]*execution\.clear\(\)/,
  ],
  [
    "ReactFlow node change handler clears run state only for execution-affecting node changes",
    /onCanvasNodesChange[\s\S]*if \(changes\.some\(isExecutionAffectingNodeChange\)\) clearStaleRunState\(\)[\s\S]*applyNodeChanges\(changes,\s*current\)/,
  ],
  [
    "ReactFlow edge changes clear stale run state because connections affect execution",
    /onCanvasEdgesChange[\s\S]*if \(changes\.some\(isGraphChangingEdgeChange\)\) clearStaleRunState\(\)[\s\S]*applyEdgeChanges\(changes,\s*current\)/,
  ],
  [
    "manual connect or real-port reconnect clears stale run state before updating edges",
    /const commitNewConnection = useCallback[\s\S]*createEdgeAtomically[\s\S]*clearStaleRunState\(\)[\s\S]*setEdges\(result\.edges\)[\s\S]*const commitEdgeReconnect = useCallback[\s\S]*reconnectEdgeAtomically[\s\S]*clearStaleRunState\(\)[\s\S]*setEdges\(result\.edges\)/,
  ],
  [
    "node insertion clears stale run state before appending the new node",
    /const insertNode = useCallback[\s\S]*clearStaleRunState\(\)[\s\S]*setNodes\(\(ns\) => \[\.\.\.ns,\s*node\]\)/,
  ],
  [
    "node deletion clears stale run state before removing nodes and edges",
    /const deleteNode = useCallback[\s\S]*clearStaleRunState\(\)[\s\S]*setNodes\(\(ns\) => ns\.filter/,
  ],
  [
    "node duplication clears stale run state before adding the duplicate",
    /const duplicateNode = useCallback[\s\S]*clearStaleRunState\(\)[\s\S]*const duplicate:/,
  ],
  [
    "node config or label edits clear stale run state before updating data",
    /const updateNodeData = useCallback[\s\S]*clearStaleRunState\(\)[\s\S]*data:\s*\{ \.\.\.n\.data, \.\.\.patch \}/,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(canvasView))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} run-state staleness requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas run-state staleness contract passed.");
