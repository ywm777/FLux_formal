import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const controllerPath = resolve(
  root,
  "src/features/canvas/keyboard/useCanvasKeyboardController.ts",
);
const controller = existsSync(controllerPath)
  ? readFileSync(controllerPath, "utf8")
  : "";

const requirements = [
  [
    "CanvasView composes the keyboard controller",
    /import \{ useCanvasKeyboardController \} from "\.\/keyboard\/useCanvasKeyboardController\.js";[\s\S]*useCanvasKeyboardController\(\{/,
    canvasView,
  ],
  [
    "the keyboard controller owns the global keydown listener",
    /useEffect\(\(\) => \{[\s\S]*function onCanvasKeyDown\(event: KeyboardEvent\)[\s\S]*window\.addEventListener\("keydown", onCanvasKeyDown\)[\s\S]*window\.removeEventListener\("keydown", onCanvasKeyDown\)/,
    controller,
  ],
  [
    "the controller owns shortcut matching and editable target protection",
    /import \{[\s\S]*isEditableShortcutTarget,[\s\S]*matchesShortcut,[\s\S]*\} from "\.\.\/\.\.\/\.\.\/lib\/keyboardShortcuts\.js";[\s\S]*isEditableShortcutTarget\(event\.target\)[\s\S]*isEditableShortcutTarget\(document\.activeElement\)/,
    controller,
  ],
  [
    "Escape closes transient layers in priority order before clearing selection",
    /matchesShortcut\(event, "close-layer"\)[\s\S]*renameOpen[\s\S]*onCloseRename\(\)[\s\S]*paletteOpen[\s\S]*onClosePalette\(\)[\s\S]*menuOpen[\s\S]*onCloseMenu\(\)[\s\S]*inspectingNodeId[\s\S]*onCloseInspector\(\)[\s\S]*onClearSelection\(\)/,
    controller,
  ],
  [
    "edge and multi-selection delete routes before single-node handling",
    /selectedEdgeId && matchesShortcut\(event, "delete-node"\)[\s\S]*onDeleteEdge\(selectedEdgeId\)[\s\S]*selectedNodeIds\.length > 0[\s\S]*onDeleteSelectedNodes\(\)[\s\S]*if \(!selectedNodeId\) return;/,
    controller,
  ],
  [
    "the controller routes save, run, view, history, and node actions through ports",
    /onSave\(\)[\s\S]*onRunPreview\(\)[\s\S]*onFitView\(\)[\s\S]*onRedo\(\)[\s\S]*onUndo\(\)[\s\S]*onInspectNode\(selectedNodeId\)[\s\S]*onDeleteNode\(selectedNodeId\)[\s\S]*onDuplicateNode\(selectedNodeId\)/,
    controller,
  ],
  [
    "CanvasView injects the existing semantic canvas actions",
    /useCanvasKeyboardController\(\{[\s\S]*onSave:[\s\S]*onRunPreview:[\s\S]*onFitView:[\s\S]*onUndo:[\s\S]*onRedo:[\s\S]*onDeleteEdge:[\s\S]*onDeleteSelectedNodes:[\s\S]*onDuplicateSelectedNodes:[\s\S]*onInspectNode:[\s\S]*onDeleteNode:[\s\S]*onDuplicateNode:/,
    canvasView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const forbiddenControllerImports = [
  ["application stores", /from ["'][^"']*\/store\//],
  ["React Flow", /from ["']@xyflow\/react["']/],
  ["Tauri", /from ["']@tauri-apps\//],
  ["execution or API services", /from ["'][^"']*(?:executionGateway|api)\.js["']/],
].filter(([, pattern]) => pattern.test(controller));

const leakedCanvasOwnership = [
  ["CanvasView still listens for global keydown events", /window\.addEventListener\("keydown"/],
  ["CanvasView still imports shortcut matching internals", /from "\.\.\/\.\.\/lib\/keyboardShortcuts\.js"/],
].filter(([, pattern]) => pattern.test(canvasView));

if (missing.length > 0 || forbiddenControllerImports.length > 0 || leakedCanvasOwnership.length > 0) {
  console.error("Canvas keyboard architecture contract failed:");
  for (const label of missing) console.error(`- Missing: ${label}`);
  for (const [label] of forbiddenControllerImports) console.error(`- Forbidden controller dependency: ${label}`);
  for (const [label] of leakedCanvasOwnership) console.error(`- Leaked ownership: ${label}`);
  process.exit(1);
}

console.log("Canvas keyboard architecture contract passed.");
