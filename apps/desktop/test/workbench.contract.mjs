import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const appStore = readFileSync(resolve(root, "src/store/appStore.ts"), "utf8");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const workbenchView = readOptional(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
);
const legacyTasksViewPath = resolve(root, "src/features/tasks/TasksView.tsx");

const requirements = [
  [
    "top-level mode is workbench/canvas, not tasks/canvas",
    /export type AppMode = "workbench" \| "canvas"/,
    appStore,
  ],
  [
    "app opens on the workbench by default",
    /mode:\s*"workbench"/,
    appStore,
  ],
  [
    "app store only owns top-level surface navigation",
    !/lastExecution|setLastExecution|setRunning|running:\s*boolean|ExecutionResponse/.test(appStore),
    appStore,
  ],
  [
    "App keeps workbench and canvas mounted as persistent product surfaces",
    /import \{ WorkbenchView \} from "\.\/features\/workbench\/WorkbenchView\.js";[\s\S]*data-app-view="workbench"[\s\S]*<WorkbenchView[\s\S]*active=\{mode === "workbench"\}[\s\S]*data-app-view="canvas"[\s\S]*<CanvasView[\s\S]*active=\{mode === "canvas"\}/,
    app,
  ],
  [
    "title bar provides explicit workbench/canvas navigation",
    /role="tablist"[\s\S]*aria-label="主导航"[\s\S]*setMode\(item\.mode\)/,
    titleBar,
  ],
  [
    "title bar uses 工作台 instead of 任务",
    /mode:\s*"workbench"[\s\S]*label:\s*"工作台"[\s\S]*mode:\s*"canvas"[\s\S]*label:\s*"画布"/,
    titleBar,
  ],
  [
    "canvas context menu returns to workbench",
    /label:\s*"返回工作台"[\s\S]*setMode\("workbench"\)/,
    canvasView,
  ],
  [
    "workbench is implemented as a real product surface",
    /export function WorkbenchView\(\{ active = true \}: \{ active\?: boolean \}\)/,
    workbenchView,
  ],
  [
    "workbench hands workflow opening to the canvas without execution",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*workflowCommands\.openWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)/,
    workbenchView,
  ],
  [
    "workbench relies on the primary navigation for current-canvas entry",
    /PRIMARY_NAV[\s\S]*label:\s*"画布"[\s\S]*role="tablist"[\s\S]*aria-label="主导航"/,
    titleBar,
  ],
  [
    "current canvas section does not duplicate the global canvas entry",
    !/aria-label="继续画布"|继续画布|openCanvasButton/.test(workbenchView),
    workbenchView,
  ],
  [
    "workbench has no visible 任务 page wording",
    !/任务页|切到任务|任务视图/.test(appStore + app + titleBar + canvasView + workbenchView),
  ],
  [
    "legacy task page file has been removed from the desktop product architecture",
    !existsSync(legacyTasksViewPath),
  ],
  [
    "workbench default surface is a launchpad, not a permanent execution dashboard",
    !/执行详情|最近运行|summaryBand|contentGrid|sidePanel/.test(workbenchView),
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => {
    if (typeof pattern === "boolean") return !pattern;
    return !pattern.test(source);
  })
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workbench product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench product contract passed.");
