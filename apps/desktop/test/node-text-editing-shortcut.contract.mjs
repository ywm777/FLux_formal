import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const nodeInspector = readFileSync(
  resolve(root, "src/features/canvas/NodeInspector.tsx"),
  "utf8",
);
const keyboardController = readFileSync(
  resolve(root, "src/features/canvas/keyboard/useCanvasKeyboardController.ts"),
  "utf8",
);
const shortcuts = readFileSync(
  resolve(root, "src/lib/keyboardShortcuts.ts"),
  "utf8",
);

const requirements = [
  [
    "node inspector declares a local editing shortcut scope",
    /data-canvas-shortcuts="ignore"/,
    nodeInspector,
  ],
  [
    "Delete and Backspace keep their native editing behavior without reaching canvas deletion",
    /onKeyDownCapture[\s\S]*event\.key === "Delete" \|\| event\.key === "Backspace"[\s\S]*event\.stopPropagation\(\)/,
    nodeInspector,
  ],
  [
    "canvas deletion remains behind the shared editor guard",
    /isEditableShortcutTarget\(event\.target\)[\s\S]*isEditableShortcutTarget\(document\.activeElement\)[\s\S]*if \(!selectedNodeId\) return;[\s\S]*matchesShortcut\(event, "delete-node"\)[\s\S]*onDeleteNode\(selectedNodeId\)/,
    keyboardController,
  ],
  [
    "shared editor guard recognizes the node editor scope and custom textboxes",
    /"\[role='textbox'\]"[\s\S]*"\[data-canvas-shortcuts='ignore'\]"/,
    shortcuts,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} node text editing shortcut requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Node text editing shortcut contract passed.");
