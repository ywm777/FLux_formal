import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const workflowCommands = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);

const requirements = [
  [
    "command palette imports node definitions for hidden node search",
    /import \{ catalogNodes \} from "\.\.\/lib\/registry\.js";[\s\S]*import \{ getNodeDefinitionSummary \} from "\.\.\/lib\/nodeDisplay\.js";/,
    titleBar,
  ],
  [
    "canvas-mode command palette exposes builtin and active personal node commands",
    /mode === "canvas"[\s\S]*catalogNodes[\s\S]*customNodeDefinitions[\s\S]*\.map\(\(def\): CommandItem => \(\{[\s\S]*id:\s*`node:\$\{def\.id\}`[\s\S]*label:\s*def\.name[\s\S]*group:\s*def\.id\.startsWith\("custom\."\) \? "我的节点" : "能力"/,
    titleBar,
  ],
  [
    "selecting a node command requests direct insertion instead of opening a permanent library",
    /if \(item\.id\.startsWith\("node:"\)\) \{[\s\S]*workflowCommands\.insertNodeType\(item\.id\.slice\("node:"\.length\)\)[\s\S]*return;/,
    titleBar,
  ],
  [
    "workflow commands carry a typed node insertion request",
    /insertNodeType: \(nodeType: string\) => Promise<void>[\s\S]*insertNodeType: async \(nodeType\)[\s\S]*activeHandlers\?\.insertNodeType\(nodeType\)/,
    workflowCommands,
  ],
  [
    "canvas registers the typed node insertion handler",
    /useRegisterWorkflowCommands\(\{[\s\S]*insertNodeType: insertNodeFromCommand/,
    canvasView,
  ],
  [
    "canvas inserts the requested node type at the viewport center",
    /const insertNodeFromCommand = useCallback\(\(nodeType: string\)[\s\S]*window\.innerWidth \/ 2[\s\S]*window\.innerHeight \/ 2[\s\S]*insertNode\(nodeType, position\)/,
    canvasView,
  ],
];

const forbidden = [
  [
    "node type commands do not resurrect a permanent node library surface",
    /节点库|拖入画布|library/i,
    canvasView,
  ],
  [
    "command palette does not expose implementation-facing node grouping",
    /group:\s*"节点"/,
    titleBar,
  ],
  [
    "canvas store does not carry typed insertion commands",
    /insertNodeNonce|insertNodeType|requestInsertNodeType/,
    canvasStore,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} global command node insertion requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden node insertion pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Global command node insertion contract passed.");
