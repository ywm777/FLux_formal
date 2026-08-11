import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const executionDisplay = read("src/lib/executionDisplay.ts");
const canvasView = read("src/features/canvas/CanvasView.tsx");
const workbenchView = read("src/features/workbench/WorkbenchView.tsx");
const fluxNode = read("src/features/canvas/FluxNode.tsx");

const requirements = [
  [
    "execution display helper exposes product-facing execution message copy",
    /export function formatExecutionMessage[\s\S]*(请求地址未配置|请求地址格式不正确)/,
    executionDisplay,
  ],
  [
    "execution logs normalize raw technical messages before rendering",
    /message:\s*formatExecutionMessage\(log\.message\)/,
    executionDisplay,
  ],
  [
    "canvas run progress top-level errors use product-facing copy",
    /activeLabel:\s*formatExecutionMessage\(testRunError\)/,
    canvasView,
  ],
  [
    "canvas run errors are carried onto node run state for product-facing node tooltips",
    /error:\s*run\.error/,
    canvasView,
  ],
  [
    "canvas node tooltip uses product-facing error copy",
    /title=\{[\s\S]*d\.run\?\.error[\s\S]*formatExecutionMessage\(d\.run\.error\)[\s\S]*`过程状态：\$\{runLabel\}`[\s\S]*\}/,
    fluxNode,
  ],
];

const forbidden = [
  [
    "execution logs do not pass raw messages through",
    /message:\s*log\.message/,
    executionDisplay,
  ],
  [
    "canvas test-run does not render raw top-level errors",
    /\{testRunError\}<\/div>/,
    canvasView,
  ],
  [
    "canvas test-run does not render raw row errors",
    />\{run\.error\}<\/span>/,
    canvasView,
  ],
  [
    "workbench does not render raw row errors",
    />\{run\.error\}<\/span>/,
    workbenchView,
  ],
  [
    "canvas node tooltip does not expose raw error messages",
    /title=\{d\.run\.error \?\?/,
    fluxNode,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} execution message requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden execution message pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Execution message contract passed.");
