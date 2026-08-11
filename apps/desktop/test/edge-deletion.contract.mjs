import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvas = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const fluxEdge = readFileSync(resolve(root, "src/features/canvas/FluxEdge.tsx"), "utf8");

const requirements = [
  ["canvas tracks an edge independently from node selection", /nodeIds: selectedNodeIds[\s\S]*edgeId: selectedEdgeId/],
  ["clicking an edge selects it and clears node selection", /onEdgeClick=\{[\s\S]*selection\.selectEdge\(edge\.id\)/],
  ["default edges use the dedicated high-contrast canvas edge token", /isErrorPath \? "color-mix\(in srgb, var\(--danger\) 72%, var\(--canvas-edge\)\)" : "var\(--canvas-edge\)"/],
  ["selected edges keep a wider interaction target and visible highlight", /interactionWidth:\s*20[\s\S]*strokeWidth:\s*isSelected \? 2\.4[\s\S]*completedPath \? 2 : 1\.75[\s\S]*strokeLinecap:\s*"round"/],
  ["short edges cannot be fully covered by their execution-order label", /endpointScreenDistance[\s\S]*MIN_EDGE_LABEL_DISTANCE_PX \? label : undefined[\s\S]*label=\{visibleLabel\}/, fluxEdge],
  ["nearby nodes use a direct compact connector instead of a large detour", /COMPACT_EDGE_DISTANCE_PX[\s\S]*compactEdgePath[\s\S]*`M\$\{input\.source\.x\},\$\{input\.source\.y\} L\$\{input\.target\.x\},\$\{input\.target\.y\}`[\s\S]*endpointScreenDistance < COMPACT_EDGE_DISTANCE_PX/, fluxEdge],
  ["edge strokes keep a stable screen width while zooming", /vectorEffect:\s*"non-scaling-stroke"/, fluxEdge],
  ["retrying an existing connection selects the committed edge", /selectDuplicateConnection[\s\S]*selectConnectionEdge\(duplicate\.id\)[\s\S]*onDuplicate:\s*selectDuplicateConnection/, canvas],
  ["edge deletion records undo history and clears stale execution output", /const deleteEdge = useCallback\([\s\S]*recordHistory\(\)[\s\S]*clearStaleRunState\(\)[\s\S]*filter\(\(edge\) => edge\.id !== id\)/],
  ["native React Flow deletion is disabled so deletion always uses Flux history", /deleteKeyCode={null}/],
  ["right clicking an edge exposes a destructive delete action", /const onEdgeContextMenu[\s\S]*label:\s*"删除连线"[\s\S]*deleteEdge\(menu\.edgeId\)[\s\S]*onEdgeContextMenu={onEdgeContextMenu}/],
];

const missing = requirements.filter(([, pattern, source = canvas]) => !pattern.test(source)).map(([label]) => label);
if (missing.length) {
  console.error(`Missing ${missing.length} edge deletion requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Edge deletion contract passed.");
