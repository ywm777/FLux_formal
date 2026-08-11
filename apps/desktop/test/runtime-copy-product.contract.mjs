import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

const visibleSources = `${titleBar}\n${canvasView}\n${workbenchView}`;

const requirements = [
  [
    "command palette presents the unified workflow execution action",
    /label:\s*testing \? "工作流执行中" : "执行工作流"[\s\S]*description:\s*"保存并执行当前画布"/,
    titleBar,
  ],
  [
    "title-bar run progress uses direct product language",
    /运行进度[\s\S]*runProgress\.completed[\s\S]*runProgress\.total/,
    titleBar,
  ],
  [
    "canvas keeps execution delivery language on the final node",
    /showRunOutput:\s*deliveryNodeIds\.has\(node\.id\)/,
    canvasView,
  ],
];

const forbidden = [
  [
    "visible desktop runtime copy does not expose draft terminology",
    /保存草稿|草稿并运行|当前草稿/,
  ],
  [
    "visible runtime panels do not explain that logs appear after running",
    /测试运行开始后会显示日志|开始后会显示日志/,
  ],
  [
    "visible runtime surfaces do not present the run drawer as a test/debug view",
    /title="测试运行"|aria-label=\{testing \? "测试运行中" : "测试运行"\}|label:\s*testing \? "测试运行中" : "测试运行"|emptyHint="暂无日志"/,
  ],
  [
    "visible runtime metrics do not use engineering log language",
    /<Metric(?:Line)? label="日志"/,
  ],
  [
    "visible run panel copy does not say waiting for nodes to return",
    /等待节点返回/,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(visibleSources))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} runtime copy product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden runtime copy pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Runtime copy product contract passed.");
