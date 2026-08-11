import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");

const requirements = [
  [
    "title-bar run progress uses direct progress copy instead of internal sequence copy",
    /运行进度[\s\S]*runProgress\.completed[\s\S]*runProgress\.total/,
  ],
];

const forbidden = [
  ["canvas test run panel does not expose internal sequence copy", /label="(?:序列|执行序列)"/],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(`${workbenchView}\n${canvasView}\n${titleBar}`))
  .map(([label]) => label);

const presentForbidden = [
  ...forbidden
    .filter(([label, pattern]) => label.startsWith("canvas") && pattern.test(canvasView))
    .map(([label]) => label),
];

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} run metric copy requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden metric copy pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Run metric copy contract passed.");
