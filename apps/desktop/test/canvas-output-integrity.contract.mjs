import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const nodeSource = readFileSync(
  resolve(desktopRoot, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const requirements = [
  [
    "delivery output preserves and copies the complete business value",
    (source) =>
      /function formatInlineOutput[\s\S]*return text;/.test(source) &&
      /navigator\.clipboard\.writeText\(inlineOutput\)/.test(source),
  ],
  [
    "output rendering must not silently replace the tail with an ellipsis",
    (source) => !/text\.slice\(0, 717\)/.test(source),
  ],
  [
    "failed nodes expose the concrete execution error on the canvas",
    /d\.run\?\.status === NODE_RUN_STATUS\.FAILED[\s\S]*role="alert"[\s\S]*formatExecutionMessage\(d\.run\.error\)/,
  ],
  [
    "resized runtime input fields consume the available node height",
    (source) =>
      /fillAvailable=\{props\.fillAvailable\}/.test(source) &&
      /runtimeInputFillStyle\(fillRows\)/.test(source) &&
      /const nodeBodyStyle[\s\S]*display: "flex"[\s\S]*flexDirection: "column"/.test(source) &&
      /runtimeInputFillStyle[\s\S]*flex: "1 1 auto"/.test(source) &&
      /runtimeFieldFillStyle[\s\S]*gridTemplateRows: "auto minmax\(0, 1fr\)"/.test(source) &&
      /runtimeTextareaFillStyle[\s\S]*height: "100%"[\s\S]*maxHeight: "none"/.test(source),
  ],
];

const missing = requirements
  .filter(([, check]) => typeof check === "function" ? !check(nodeSource) : !check.test(nodeSource))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} output-integrity requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas output integrity contract passed.");
