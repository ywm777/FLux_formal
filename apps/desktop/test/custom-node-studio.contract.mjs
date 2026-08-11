import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const appStore = readFileSync(resolve(root, "src/store/appStore.ts"), "utf8");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const studio = readFileSync(resolve(root, "src/features/node-studio/NodeStudioView.tsx"), "utf8");
const nodeStore = readFileSync(
  resolve(root, "src/features/node-studio/store/customNodeStore.ts"),
  "utf8",
);
const runtime = readFileSync(
  resolve(root, "src/features/node-studio/infrastructure/browserCustomNodeRuntime.ts"),
  "utf8",
);
const canvas = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");

const requirements = [
  [
    "node studio is a first-class application destination",
    /AppMode\s*=\s*"workbench"\s*\|\s*"canvas"\s*\|\s*"nodes"/,
    appStore,
  ],
  [
    "title bar exposes the personal node library",
    /mode:\s*"nodes"[\s\S]*label:\s*"节点库"/,
    titleBar,
  ],
  [
    "app keeps node studio in the same view-layer continuity system",
    /data-app-view="nodes"[\s\S]*data-view-state=\{mode === "nodes"[\s\S]*<NodeStudioView/,
    app,
  ],
  [
    "studio exposes AI authoring, structured contracts, tests, and activation",
    /告诉 AI，你想创造什么节点[\s\S]*接口与能力[\s\S]*逻辑与测试[\s\S]*启用到画布/,
    studio,
  ],
  [
    "draft and active revision are persisted separately",
    /activeRevision[\s\S]*testReport[\s\S]*runCustomNodeTestSuite[\s\S]*version\s*=\s*\(result\.nodePackage\.activeRevision\?\.version \?\? 0\) \+ 1/,
    nodeStore,
  ],
  [
    "custom code runs in an isolated worker with timeout and output checks",
    /maxOutputBytes[\s\S]*new Worker\(blobUrl[\s\S]*runtimeTimeoutMs/,
    runtime,
  ],
  [
    "external access crosses the declared capability gateway",
    /capabilityKey[\s\S]*bindings\[capabilityKey\][\s\S]*ctx\.invoke\(bindingId, action, payload\)/,
    runtime,
  ],
  [
    "active personal nodes join the local canvas palette",
    /workspaceKind === "local" \? customNodeDefinitions : \[\][\s\S]*我的节点/,
    canvas,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} custom node studio requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Custom node studio contract passed.");
