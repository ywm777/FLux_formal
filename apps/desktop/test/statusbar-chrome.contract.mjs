import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const statusBar = readFileSync(resolve(root, "src/components/StatusBar.tsx"), "utf8");

const requirements = [
  [
    "status bar is only shown on the canvas surface",
    /mode === "canvas" && <StatusBar \/>/,
    app,
  ],
  [
    "status bar does not repeat the current workflow title",
    !/useCanvasStore\(\(s\) => s\.title\)|\{title\}/.test(statusBar),
  ],
  [
    "status bar exposes only save state and errors",
    /aria-label="保存状态"[\s\S]*LABEL\[status\][\s\S]*status === "error" && error/,
    statusBar,
  ],
];

const missing = requirements
  .filter(([, pattern, source = ""]) => {
    if (typeof pattern === "boolean") return !pattern;
    return !pattern.test(source);
  })
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} status bar chrome requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Status bar chrome contract passed.");
