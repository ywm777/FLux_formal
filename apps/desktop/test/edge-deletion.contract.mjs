import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvas = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");

const requirements = [
  ["canvas tracks an edge independently from node selection", /nodeIds: selectedNodeIds[\s\S]*edgeId: selectedEdgeId/],
  ["clicking an edge selects it and clears node selection", /onEdgeClick=\{[\s\S]*selection\.selectEdge\(edge\.id\)/],
  ["selected edges keep a wider interaction target and restrained highlight", /interactionWidth:\s*20[\s\S]*strokeWidth:\s*isSelected \? 2\.25[\s\S]*strokeLinecap:\s*"round"/],
  ["edge deletion records undo history and clears stale execution output", /const deleteEdge = useCallback\([\s\S]*recordHistory\(\)[\s\S]*clearStaleRunState\(\)[\s\S]*filter\(\(edge\) => edge\.id !== id\)/],
  ["native React Flow deletion is disabled so deletion always uses Flux history", /deleteKeyCode={null}/],
  ["right clicking an edge exposes a destructive delete action", /const onEdgeContextMenu[\s\S]*label:\s*"删除连线"[\s\S]*deleteEdge\(menu\.edgeId\)[\s\S]*onEdgeContextMenu={onEdgeContextMenu}/],
];

const missing = requirements.filter(([, pattern]) => !pattern.test(canvas)).map(([label]) => label);
if (missing.length) {
  console.error(`Missing ${missing.length} edge deletion requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Edge deletion contract passed.");
