import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");

const canvasView = readFileSync(
  resolve(desktopRoot, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const nodeDisplay = readFileSync(
  resolve(desktopRoot, "src/lib/nodeDisplay.ts"),
  "utf8",
);
const graphBridge = readFileSync(
  resolve(desktopRoot, "src/features/canvas/graphBridge.ts"),
  "utf8",
);
const builtinNodes = readFileSync(
  resolve(repoRoot, "packages/node-sdk/src/builtin/index.ts"),
  "utf8",
);

const requirements = [
  [
    "new workflows start from an intentionally blank canvas",
    /function seedNodes\(\): Node<FluxNodeData>\[\] \{\s*return \[\];\s*\}/,
    canvasView,
  ],
  [
    "log capability is presented as a user-facing result node",
    /id:\s*"flux\.action\.log"[\s\S]*name:\s*"记录结果"[\s\S]*category:\s*"输出"/,
    builtinNodes,
  ],
  [
    "basic carrier is labelled as a tool, not an internal capability bucket",
    /basic:\s*"工具"/,
    nodeDisplay,
  ],
  [
    "saved starter workflows migrate the legacy log node label only when it matches the old default",
    /const LEGACY_NODE_LABELS[\s\S]*"flux\.action\.log"[\s\S]*"日志输出":\s*"记录结果"[\s\S]*function resolveNodeLabel\([\s\S]*LEGACY_NODE_LABELS\[type\]\?\.\[storedLabel\] \?\? storedLabel[\s\S]*label:\s*resolveNodeLabel\(n\.type,\s*storedLabel,\s*def\)/,
    graphBridge,
  ],
];

const forbidden = [
  [
    "starter product copy does not expose log-output terminology",
    /name:\s*"日志输出"/,
    builtinNodes,
  ],
  [
    "starter product copy does not expose debug category",
    /category:\s*"调试"/,
    builtinNodes,
  ],
  [
    "node subtitle copy does not expose internal capability wording",
    /basic:\s*"基础能力"/,
    nodeDisplay,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} starter canvas product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden starter copy pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Starter canvas product contract passed.");
