import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readOptional(path) {
  const resolved = resolve(root, path);
  return existsSync(resolved) ? readFileSync(resolved, "utf8") : "";
}

const nodeDisplay = readOptional("src/lib/nodeDisplay.ts");
const executionDisplay = readOptional("src/lib/executionDisplay.ts");
const canvasView = read("src/features/canvas/CanvasView.tsx");
const fluxNode = read("src/features/canvas/FluxNode.tsx");
const nodeInspector = read("src/features/canvas/NodeInspector.tsx");
const workbenchView = read("src/features/workbench/WorkbenchView.tsx");
const legacyTasksViewPath = resolve(root, "src/features/tasks/TasksView.tsx");

const requirements = [
  [
    "node display helper centralizes product-facing labels",
    /export function getNodeTypeName[\s\S]*registry\.resolve\(type\)/,
    nodeDisplay,
  ],
  [
    "node display helper exposes definition summaries for palette rows",
    /export function getNodeDefinitionSummary/,
    nodeDisplay,
  ],
  [
    "execution display helper maps log node ids to product-facing node names",
    /export function formatExecutionLogs[\s\S]*getNodeTypeName\(run\.type\)/,
    executionDisplay,
  ],
  [
    "canvas palette does not expose internal node ids as descriptions",
    !/description:\s*def\.id/.test(canvasView),
  ],
  [
    "canvas palette uses product-facing node summaries",
    /description:\s*getNodeDefinitionSummary\(def\)/,
    canvasView,
  ],
  [
    "canvas node cards do not render raw internal node types",
    !/\{\s*d\.fluxType\s*\}/.test(fluxNode),
  ],
  [
    "canvas node cards render a product-facing business role",
    /presentation\.roleLabel/,
    fluxNode,
  ],
  [
    "node inspector does not render raw internal node types",
    !/\{\s*node\.data\.fluxType\s*\}/.test(nodeInspector),
  ],
  [
    "node inspector renders a product-facing node type name",
    /getNodeTypeName\(node\.data\.fluxType\)/,
    nodeInspector,
  ],
  [
    "workbench execution rows do not render raw internal run types",
    !/\{\s*run\.type\s*\}/.test(workbenchView),
  ],
  [
    "workbench execution rows do not render raw node ids as primary copy",
    !/<span[^>]*>\{\s*run\.nodeId\s*\}<\/span>/.test(workbenchView),
  ],
  [
    "legacy task page is not part of the deliverable desktop product",
    !existsSync(legacyTasksViewPath),
  ],
];

const missing = requirements
  .filter(([, pattern, source = ""]) => {
    if (typeof pattern === "boolean") return !pattern;
    return !pattern.test(source);
  })
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} node display requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Node display contract passed.");
