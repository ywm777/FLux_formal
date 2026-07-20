import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const readDesktop = (path) => readFileSync(resolve(desktopRoot, path), "utf8");
const readRepo = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const nodeTypes = readRepo("packages/node-sdk/src/types.ts");
const productivity = readRepo("packages/node-sdk/src/builtin/productivity.ts");
const executionService = readRepo("apps/api/src/modules/executions/executions.service.ts");
const runtime = readRepo("packages/workflow-runtime/src/runtime.ts");
const executionController = readRepo("apps/api/src/modules/executions/executions.controller.ts");
const api = readDesktop("src/lib/api.ts");
const canvasView = readDesktop("src/features/canvas/CanvasView.tsx");
const fluxNode = readDesktop("src/features/canvas/FluxNode.tsx");
const workbench = readDesktop("src/features/workbench/WorkbenchView.tsx");

const requirements = [
  [
    "node definitions distinguish runtime input from persistent configuration",
    /runtimeInputSchema\?: JSONSchema/,
    nodeTypes,
  ],
  [
    "text input declares text as required per-run input",
    /textRuntimeInputSchema[\s\S]*required:\s*\["text"\][\s\S]*runtimeInputSchema:\s*textRuntimeInputSchema[\s\S]*configSchema:\s*\{ type: "object", properties: \{\} \}/,
    productivity,
  ],
  [
    "execution endpoints accept node-scoped runtime inputs",
    /body:\s*\{ workflowId: string; inputs\?: ExecutionNodeInputs \}[\s\S]*body\.inputs/,
    executionController,
  ],
  [
    "backend rejects missing required input before creating an execution",
    (source) =>
      /prepareWorkflowForExecution[\s\S]*error instanceof ExecutionInputRequiredError[\s\S]*code: error\.code[\s\S]*this\.executions\.create/.test(source) &&
      /EXECUTION_INPUT_REQUIRED[\s\S]*schema\.required[\s\S]*ExecutionInputRequiredError/.test(runtime),
    executionService,
  ],
  [
    "runtime inputs are merged only into the queued execution graph",
    (source) =>
      /structuredClone\(graph\)[\s\S]*node\.data = \{ \.\.\.node\.data, \.\.\.runtimeValues \}/.test(source) &&
      /graph: executionGraph/.test(executionService),
    runtime,
  ],
  [
    "desktop execution client sends runtime inputs for published and draft runs",
    /start:\s*\(workflowId: string, inputs: ExecutionNodeInputs = \{\}\)[\s\S]*JSON\.stringify\(\{ workflowId, inputs \}\)[\s\S]*test:\s*\(workflowId: string, inputs: ExecutionNodeInputs = \{\}\)/,
    api,
  ],
  [
    "top-bar execution validates required input and focuses the invalid node",
    /const onTestRun = useCallback[\s\S]*missingRuntimeInputFields[\s\S]*setRuntimeInputError\("请完成本次运行所需的输入"\)[\s\S]*selection\.selectNode\(missingNode\.id\)[\s\S]*executeDraftRun\(inputs\)/,
    canvasView,
  ],
  [
    "canvas keeps non-persistent runtime drafts outside render state",
    /runtimeInputDraftsRef = useRef<ExecutionNodeInputs>[\s\S]*runtimeInput:\s*runtimeSchema[\s\S]*toFormSchema\(runtimeSchema\)[\s\S]*runtimeInputDraftsRef\.current\[node\.id\][\s\S]*updateRuntimeInput\(node\.id, value\)/,
    canvasView,
  ],
  [
    "the unified top-bar action submits current runtime drafts",
    /const onTestRun = useCallback[\s\S]*inputs\[node\.id\] = runtimeInputDraftsRef\.current\[node\.id\] \?\? defaultsFromSchema\(schema\)[\s\S]*executeDraftRun\(inputs\)/,
    canvasView,
  ],
  [
    "top-level execution reuses the current node draft",
    /inputs\[node\.id\] = runtimeInputDraftsRef\.current\[node\.id\] \?\? defaultsFromSchema\(schema\)/,
    canvasView,
  ],
  [
    "runtime text fields keep native cursor and scroll state while editing",
    /function RuntimeInputSurface[\s\S]*useRef<FormValue>[\s\S]*draftRef\.current[\s\S]*defaultValue=\{String\(initialValue \?\? ""\)\}/,
    fluxNode,
  ],
  [
    "runtime draft edits do not rebuild canvas node state when no run result exists",
    /function clearNodeRunState\(\)[\s\S]*if \(!current\.some\(\(node\) => node\.data\.run\)\) return current/,
    canvasView,
  ],
  [
    "runtime input node renders editable fields without an execution command",
    /presentation\.kind === "runtime-input"[\s\S]*<RuntimeInputSurface[\s\S]*function RuntimeInputSurface[\s\S]*interaction\.onChange/,
    fluxNode,
  ],
  [
    "workbench opens workflows instead of executing them",
    /onClick=\{\(\) => openWorkflowOnCanvas\(workflow\.id\)\}[\s\S]*>\s*打开\s*<\/Button>/,
    workbench,
  ],
];

const forbidden = [
  ["runtime input typing cannot use canvas-level React state", /setRuntimeInputDrafts|\[runtimeInputDrafts,/, canvasView],
  ["runtime input nodes cannot start execution", /interaction\.onSubmit|submitLabel|开始运行|运行工作流|重新运行/, fluxNode],
  ["workbench cannot start execution", /requestRunWorkflow|runWorkflow\(|>\s*开始\s*</, workbench],
  ["canvas cannot auto-run a workflow opened from the workbench", /pendingRunWorkflowId|beginRunPreparation|onPublishedRun/, canvasView],
];

const missing = requirements
  .filter(([, pattern, source]) =>
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source),
  )
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} runtime-input preflight requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden runtime-input pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Runtime-input preflight contract passed.");
