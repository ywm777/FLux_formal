import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const canvasSession = readFileSync(
  resolve(root, "src/features/canvas/session/useCanvasSession.ts"),
  "utf8",
);
const workflowSession = readFileSync(
  resolve(root, "src/features/workspace/application/workflowSessionService.ts"),
  "utf8",
);

const requirements = [
  [
    "canvas store has an explicit new-workflow request signal",
    /newWorkflowNonce:\s*number[\s\S]*requestNewWorkflow:\s*\(\) => void/,
    canvasStore,
  ],
  [
    "requestNewWorkflow resets draft identity and bumps a nonce",
    /requestNewWorkflow:\s*\(\) =>\s*set\(\(s\) => \(\{[\s\S]*workflowId:\s*null[\s\S]*title:\s*"未命名工作流"[\s\S]*newWorkflowNonce:\s*s\.newWorkflowNonce \+ 1/,
    canvasStore,
  ],
  [
    "workbench exposes a low-chrome new workflow action",
    /const requestNewWorkflow = useCanvasStore\(\(s\) => s\.requestNewWorkflow\)[\s\S]*function createWorkflow\(\)[\s\S]*requestNewWorkflow\(\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label="新建工作流"[\s\S]*onClick=\{createWorkflow\}/,
    workbenchView,
  ],
  [
    "workbench keeps new workflow as a launch action instead of hydrating the current draft",
    /function createWorkflow\(\)[\s\S]*requestNewWorkflow\(\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label="新建工作流"/,
    workbenchView,
  ],
  [
    "canvas session listens for new workflow requests while mounted",
    /const newWorkflowNonce = useCanvasStore[\s\S]*seenNewWorkflowNonce[\s\S]*resetCanvasDraft\(\)/,
    canvasSession,
  ],
  [
    "initial canvas hydration honors a new-workflow request before loading latest",
    /if \(request\.pendingNewWorkflow\) return \{ kind: "draft" \}[\s\S]*latestWorkflow\(await repository\.list\(\)\)/,
    workflowSession,
  ],
  [
    "stale hydration cannot overwrite a newer open or new-workflow request",
    /const hydrationIsCurrent[\s\S]*current\.openWorkflowId === requestedWorkflowId[\s\S]*current\.openWorkflowNonce === hydrationOpenWorkflowNonce[\s\S]*current\.newWorkflowNonce === hydrationNewWorkflowNonce[\s\S]*cancelled \|\| !hydrationIsCurrent\(\)/,
    canvasSession,
  ],
  [
    "a new workflow starts with a truly empty canvas",
    /function seedNodes\(\): Node<FluxNodeData>\[\] \{\s*return \[\];\s*\}/,
    canvasView,
  ],
  [
    "new workflow reset keeps templates populated and clears transient canvas surfaces",
    /function resetCanvasDraft\(\)[\s\S]*const freshNodes = seedNodes\(\)[\s\S]*setNodes\(freshNodes\)[\s\S]*setEdges\(\[\]\)[\s\S]*setTestRunDetail\(null\)[\s\S]*setTestRunResult\(null\)[\s\S]*setTestRunError\(null\)[\s\S]*undoStackRef\.current = \[\]/,
    canvasView,
  ],
  [
    "new workflow reset forces the empty or templated graph to autosave",
    /const FORCE_AUTOSAVE_SIGNATURE[\s\S]*resetCanvasDraft\(\)[\s\S]*lastSignatureRef\.current = FORCE_AUTOSAVE_SIGNATURE/,
    canvasSession,
  ],
  [
    "initial hydration does not replace forced autosave with the old signature",
    /if \(!lastSignatureRef\.current\)[\s\S]*lastSignatureRef\.current = signatureRef\.current/,
    canvasSession,
  ],
];

const forbidden = [
  [
    "workbench does not hydrate or edit current canvas state",
    /workflowApi\.list\(\)[\s\S]*getLatestWorkflowSummary|setCanvasTitle|工作流名称/,
    workbenchView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} new workflow requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden new workflow pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench new workflow contract passed.");
