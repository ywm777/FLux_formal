import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const graphBridge = readFileSync(resolve(root, "src/features/canvas/graphBridge.ts"), "utf8");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const canvasSession = readFileSync(resolve(root, "src/features/canvas/session/useCanvasSession.ts"), "utf8");
const workflowSession = readFileSync(resolve(root, "src/features/workspace/application/workflowSessionService.ts"), "utf8");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

const requirements = [
  [
    "canvas exposes workflow rename as a temporary overlay",
    /renameOpen[\s\S]*<Drawer[\s\S]*title="重命名工作流"[\s\S]*aria-label="工作流名称"[\s\S]*value=\{renameDraft\}/,
    canvasView,
  ],
  [
    "canvas context menu opens workflow rename without showing permanent title chrome",
    /label:\s*"重命名工作流"[\s\S]*openWorkflowRename\(\)/,
    canvasView,
  ],
  [
    "rename commit trims empty values to a fallback title",
    /function commitWorkflowTitle\(\)[\s\S]*renameDraft\.trim\(\) \|\| "未命名工作流"[\s\S]*setWorkflowTitle\(nextTitle\)/,
    canvasView,
  ],
  [
    "rename field commits from the current input value on Enter",
    /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*commitWorkflowTitle\(\)/,
    canvasView,
  ],
  [
    "rename drawer provides explicit save and cancel actions",
    /onClick=\{commitWorkflowTitle\}[\s\S]*保存[\s\S]*onClick=\{\(\) => setRenameOpen\(false\)\}[\s\S]*取消/,
    canvasView,
  ],
  [
    "workbench no longer owns workflow title editing",
    !/工作流名称|setCanvasTitle|commitTitle|hydratingCanvas|workflowApi\.update/.test(workbenchView),
  ],
  [
    "setTitle marks saved canvases as locally dirty",
    /setTitle:\s*\(title\) =>\s*set\(\(state\) => \(\{[\s\S]*titleDirty:\s*state\.title === title \? state\.titleDirty : true[\s\S]*status:\s*state\.title === title \? state\.status : "idle"/,
    canvasStore,
  ],
  [
    "applyRecord clears the local title dirty flag",
    /applyRecord:[\s\S]*titleDirty:\s*false/,
    canvasStore,
  ],
  [
    "graph signature accepts the workflow title",
    /export function graphSignature\([\s\S]*title = "未命名工作流"[\s\S]*meta:\s*\{\s*title\s*\}/,
    graphBridge,
  ],
  [
    "autosave signature includes the workflow title",
    /graphSignature\(nodes,\s*edges,\s*workflowTitle,\s*groups\)/,
    canvasView,
  ],
  [
    "loaded workflow signature includes loaded title",
    /persistedGraphTitle[\s\S]*const loadedSignature = graphSignature\([\s\S]*persistedGraphTitle[\s\S]*loadedGroups/,
    canvasView,
  ],
  [
    "stale graph meta title is compared against the record title for autosave",
    /const persistedGraphTitle = parsed\.data\.meta\.title \?\? record\.title/,
    canvasView,
  ],
  [
    "canvas loads the latest updated workflow instead of relying on API order",
    /latestWorkflow\(await repository\.list\(\)\)[\s\S]*repository\.get\(latest\.id\)/,
    workflowSession,
  ],
  [
    "canvas preserves a locally edited title over a stale loaded record",
    /keepLocalTitle[\s\S]*applyRecord\(record\)[\s\S]*setTitle\(localTitle\)/,
    canvasView,
  ],
  [
    "new workflow initial signature includes current title",
    /const signature = useMemo\([\s\S]*graphSignature\(nodes, edges, workflowTitle, groups\)/,
    canvasView,
  ],
  [
    "saved graph uses the current workflow title",
    /toWorkflowGraph\([\s\S]*workflowTitle[\s\S]*\)/,
    canvasView,
  ],
  [
    "canvas autosave updates the workflow record title",
    /repository\.update\(request\.workflowId,\s*\{[\s\S]*title:\s*request\.title[\s\S]*graph:\s*request\.graph/,
    workflowSession,
  ],
  [
    "latest workflow selection sorts by updated time",
    /sort\(\(a,\s*b\) => b\.updatedAt\.localeCompare\(a\.updatedAt\)\)/,
    workflowSession,
  ],
];

const missing = requirements
  .filter(([, pattern, source = ""]) => {
    if (typeof pattern === "boolean") return !pattern;
    return !pattern.test(source);
  })
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workflow title requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workflow title contract passed.");
