import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const executionDisplay = readFileSync(
  resolve(root, "src/lib/executionDisplay.ts"),
  "utf8",
);
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const titleBar = readFileSync(
  resolve(root, "src/components/TitleBar.tsx"),
  "utf8",
);
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const requirements = [
  [
    "execution display helper exposes product-facing execution status labels",
    /const STATUS_LABEL[\s\S]*运行中[\s\S]*已完成[\s\S]*失败[\s\S]*已暂停[\s\S]*已取消[\s\S]*export function getExecutionStatusLabel/,
    executionDisplay,
  ],
  [
    "title-bar run progress labels execution status with product copy",
    /getExecutionStatusLabel\(runProgress\.status\)/,
    titleBar,
  ],
  [
    "canvas node run state keeps product-facing node status copy",
    /const RUN_LABEL:[\s\S]*运行中[\s\S]*完成[\s\S]*失败/,
    fluxNode,
  ],
];

const forbidden = [
  [
    "workbench does not expose raw execution status enum labels",
    /label=\{display\?\.status|label=\{run\.status\}|running \? "running" : "idle"/,
    workbenchView,
  ],
  [
    "canvas test-run does not expose raw execution status enum labels",
    /label=\{testRunDisplay\?\.status|label=\{run\.status\}/,
    canvasView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} execution status label requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden execution status label pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Execution status label contract passed.");
