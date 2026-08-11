import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);

const requirements = [
  [
    "canvas defines a reusable node position collision check",
    /function isNodePositionOccupied\([\s\S]*Math\.abs\(position\.x - node\.position\.x\)[\s\S]*Math\.abs\(position\.y - node\.position\.y\)/,
  ],
  [
    "canvas resolves a nearby open position before inserting nodes",
    /function findOpenNodePosition\([\s\S]*for \(let attempt = 0; attempt < 16; attempt \+= 1\)[\s\S]*isNodePositionOccupied/,
  ],
  [
    "palette insertion uses the collision-safe position before creating a node",
    /const openPosition = findOpenNodePosition\(nodes,\s*pos\)[\s\S]*createFluxNode\(def,\s*openPosition,\s*nextId\(\)\)/,
  ],
  [
    "duplicating a node also avoids landing on existing nodes",
    /const duplicatePosition = findOpenNodePosition\([\s\S]*x:\s*source\.position\.x \+ 36[\s\S]*position:\s*duplicatePosition/,
  ],
  [
    "small workflow templates render every node so fit-view can measure the full graph",
    /onlyRenderVisibleElements=\{nodes\.length > 120\}/,
  ],
  [
    "automatic fit-view runs once without animation and can be cancelled by user interaction",
    /const cancelScheduledFitView = useCallback[\s\S]*clearTimeout\(fitViewTimerRef\.current\)[\s\S]*if \(!fitViewRequestedRef\.current\) return;[\s\S]*fitView\(\{ duration: 0[\s\S]*onGestureStart:\s*cancelScheduledFitView/,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(canvasView))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} canvas layout safety requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas layout safety contract passed.");
