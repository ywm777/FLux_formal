import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const keyboardController = readFileSync(
  resolve(root, "src/features/canvas/keyboard/useCanvasKeyboardController.ts"),
  "utf8",
);

const requirements = [
  [
    "canvas centralizes opening the contextual add-node palette",
    /function openNodePaletteAtScreenPoint[\s\S]*setPaletteAnchor\(\{\s*x:\s*point\.x,\s*y:\s*point\.y\s*\}\)/,
  ],
  [
    "double click reuses the same add-node palette opener",
    /const onPaneDoubleClick = useCallback[\s\S]*openNodePaletteAtScreenPoint\(\{\s*x:\s*event\.clientX,\s*y:\s*event\.clientY\s*\}\)/,
  ],
  [
    "A key opens the add-node palette without adding visible chrome",
    /const addNodeFromKeyboard[\s\S]*if \(selectedId\)[\s\S]*openNodePaletteForAppend\(selectedId\)[\s\S]*openNodePaletteAtScreenPoint\(\{\s*x:\s*window\.innerWidth\s*\/\s*2,\s*y:\s*window\.innerHeight\s*\/\s*2,?\s*\}\)/,
    canvasView,
  ],
  [
    "add-node shortcut respects editable target guard",
    /function onCanvasKeyDown[\s\S]*isEditableShortcutTarget\(event\.target\)[\s\S]*isEditableShortcutTarget\(document\.activeElement\)[\s\S]*return;[\s\S]*matchesShortcut\(event, "add-node"\)[\s\S]*onAddNode\(\)/,
    keyboardController,
  ],
  [
    "keyboard-opened palette clears transient node surfaces before opening",
    /function openNodePaletteAtScreenPoint[\s\S]*selection\.clearCanvas\(\)[\s\S]*setMenu\(null\)[\s\S]*setPaletteOpen\(true\)/,
  ],
];

const missing = requirements
  .filter(([, pattern, source = canvasView]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} canvas add-node shortcut requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas add-node shortcut contract passed.");
