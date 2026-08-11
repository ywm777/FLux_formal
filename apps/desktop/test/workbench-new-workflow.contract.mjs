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
const workflowCommands = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);

const requirements = [
  [
    "workflow coordinator exposes a typed create-draft command",
    /createDraft: \(input: CreateWorkflowDraftInput\) => Promise<void>[\s\S]*createDraft: \(input\) =>[\s\S]*handlers\.createDraft\(input\)/,
    workflowCommands,
  ],
  [
    "startDraft resets observable workflow identity without a command signal",
    /startDraft: \(title: string\) => void[\s\S]*startDraft: \(title\) =>[\s\S]*workflowId: null[\s\S]*title: title\.trim\(\) \|\| "未命名工作流"/,
    canvasStore,
  ],
  [
    "workbench exposes a low-chrome new workflow action",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*function createWorkflow\(\)[\s\S]*workflowCommands\.createDraft\(\{ title: "未命名工作流" \}\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label="新建工作流"[\s\S]*onClick=\{createWorkflow\}/,
    workbenchView,
  ],
  [
    "workbench keeps new workflow as a launch action instead of hydrating the current draft",
    /function createWorkflow\(\)[\s\S]*workflowCommands\.createDraft\([\s\S]*setMode\("canvas"\)[\s\S]*aria-label="新建工作流"/,
    workbenchView,
  ],
  [
    "canvas session creates drafts explicitly while mounted",
    /const createDraft = useCallback[\s\S]*startDraft\(input\.title\)[\s\S]*resetCanvasDraft\(input\.templateId\)/,
    canvasSession,
  ],
  [
    "explicit drafts invalidate stale initial hydration",
    /const requestVersion = sessionRequestVersionRef\.current[\s\S]*requestVersion !== sessionRequestVersionRef\.current[\s\S]*const createDraft = useCallback[\s\S]*sessionRequestVersionRef\.current \+= 1/,
    canvasSession,
  ],
  [
    "a new workflow starts with a truly empty canvas",
    /function seedNodes\(\): Node<FluxNodeData>\[\] \{\s*return \[\];\s*\}/,
    canvasView,
  ],
  [
    "new workflow reset keeps templates populated and clears transient canvas surfaces",
    /function resetCanvasDraft\([\s\S]*templateId\?: string[\s\S]*const freshNodes = seedNodes\(\)[\s\S]*setNodes\(freshNodes\)[\s\S]*setEdges\(freshEdges\)[\s\S]*selection\.reset\(\)[\s\S]*execution\.reset\(\)[\s\S]*history\.reset\(\{ nodes: freshNodes, edges: freshEdges, groups: \[\] \}\)/,
    canvasView,
  ],
  [
    "new workflow reset forces the empty or templated graph to autosave",
    /const FORCE_AUTOSAVE_SIGNATURE[\s\S]*resetCanvasDraft\(input\.templateId\)[\s\S]*lastSignatureRef\.current = FORCE_AUTOSAVE_SIGNATURE/,
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
  [
    "canvas store does not carry new-workflow command signals",
    /newWorkflowNonce|newWorkflowPending|requestNewWorkflow|requestTemplateWorkflow|templateId/,
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
  console.error(`Missing ${missing.length} new workflow requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden new workflow pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench new workflow contract passed.");
