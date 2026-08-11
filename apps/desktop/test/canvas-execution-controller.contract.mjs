import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const model = read("src/features/canvas/execution/canvasExecution.ts");
const controller = read("src/features/canvas/execution/canvasExecutionController.ts");
const hook = read("src/features/canvas/execution/useCanvasExecutionController.ts");
const canvas = read("src/features/canvas/CanvasView.tsx");

const requirements = [
  [
    "the execution model prepares plain runtime inputs and playback frames",
    /prepareCanvasExecutionInputs[\s\S]*missingNodeId[\s\S]*buildCanvasExecutionPlaybackFrames[\s\S]*findCanvasExecutionApproval/,
    model,
  ],
  [
    "the execution controller owns an invalidation token for every async write",
    /private token = 0[\s\S]*const token = \+\+this\.token[\s\S]*isCurrent\(token\)[\s\S]*finally[\s\S]*isCurrent\(token\)/,
    controller,
  ],
  [
    "the React adapter subscribes to one framework-independent controller",
    /new CanvasExecutionController\(ports\)[\s\S]*useSyncExternalStore\([\s\S]*controller\.subscribe[\s\S]*controller\.getSnapshot[\s\S]*controller\.dispose\(\)/,
    hook,
  ],
  [
    "CanvasView composes the execution controller",
    /import \{ useCanvasExecutionController \} from "\.\/execution\/useCanvasExecutionController\.js";[\s\S]*useCanvasExecutionController\(\{/,
    canvas,
  ],
  [
    "CanvasView injects gateway, store, projection, selection, wait, and error ports",
    /useCanvasExecutionController\(\{[\s\S]*runDraft:[\s\S]*approveRun:[\s\S]*setTesting:[\s\S]*applyNodeRuns:[\s\S]*clearNodeRuns:[\s\S]*initializeNodeRuns:[\s\S]*selectNode:[\s\S]*wait:[\s\S]*formatError:/,
    canvas,
  ],
  [
    "CanvasView sends plain runtime input descriptors to the controller",
    /runtimeInputs: runtimeInputDescriptors[\s\S]*saveWorkflow: saveNow[\s\S]*getWorkflowId:[\s\S]*getSaveError:/,
    canvas,
  ],
];

const forbiddenDependencies = [
  ["React", /from ["']react["']/],
  ["React Flow", /from ["']@xyflow\/react["']/],
  ["Zustand", /from ["']zustand/],
  ["Tauri", /from ["']@tauri-apps\//],
  ["application stores", /from ["'][^"']*\/store\//],
  ["API or concrete execution gateway", /from ["'][^"']*(?:api|executionGateway)\.(?:js|ts)["']/],
].filter(([, pattern]) => pattern.test(`${model}\n${controller}`));

const leakedCanvasState = [
  ["playback token", /playbackTokenRef/],
  ["local execution detail state", /\[testRunDetail, setTestRunDetail\]/],
  ["local execution result state", /\[testRunResult, setTestRunResult\]/],
  ["local execution error state", /\[testRunError, setTestRunError\]/],
  ["local runtime input drafts ref", /runtimeInputDraftsRef/],
].filter(([, pattern]) => pattern.test(canvas));

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length || forbiddenDependencies.length || leakedCanvasState.length) {
  console.error("Canvas execution architecture contract failed:");
  for (const label of missing) console.error(`- Missing: ${label}`);
  for (const [label] of forbiddenDependencies) console.error(`- Forbidden dependency: ${label}`);
  for (const [label] of leakedCanvasState) console.error(`- Leaked CanvasView execution state: ${label}`);
  process.exit(1);
}

console.log("Canvas execution architecture contract passed.");
