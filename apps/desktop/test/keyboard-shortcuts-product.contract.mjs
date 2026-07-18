import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const shortcuts = readFileSync(resolve(root, "src/lib/keyboardShortcuts.ts"), "utf8");
const dialog = readFileSync(resolve(root, "src/components/KeyboardShortcutsDialog.tsx"), "utf8");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const workbench = readFileSync(resolve(root, "src/features/workbench/WorkbenchView.tsx"), "utf8");
const canvas = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");

const requirements = [
  [
    "shortcut catalog groups global, workbench, and canvas actions in one source",
    /ShortcutScope = "global" \| "workbench" \| "canvas"[\s\S]*id: "command-palette"[\s\S]*id: "new-workflow"[\s\S]*id: "add-node"[\s\S]*id: "nudge-node-fast"/,
    shortcuts,
  ],
  [
    "shortcut matching normalizes platform primary modifiers and exact modifier combinations",
    /const primaryPressed = event\.ctrlKey \|\| event\.metaKey[\s\S]*primaryPressed === Boolean\(binding\.primary\)[\s\S]*event\.shiftKey === Boolean\(binding\.shift\)[\s\S]*event\.altKey === Boolean\(binding\.alt\)/,
    shortcuts,
  ],
  [
    "editable inputs, textareas, selects, and contenteditable surfaces share one guard",
    /function isEditableShortcutTarget[\s\S]*"input"[\s\S]*"textarea"[\s\S]*"select"[\s\S]*"\[role='textbox'\]"[\s\S]*"\[contenteditable\]:not\(\[contenteditable='false'\]\)"[\s\S]*"\[data-canvas-shortcuts='ignore'\]"/,
    shortcuts,
  ],
  [
    "shortcut help is an accessible modal with focus restoration and Escape handling",
    /previousFocusRef\.current[\s\S]*event\.key === "Escape"[\s\S]*onClose\(\)[\s\S]*role="dialog"[\s\S]*aria-modal="true"/,
    dialog,
  ],
  [
    "title bar exposes keyboard help and global page navigation shortcuts",
    /matchesShortcut\(event, "shortcut-help"\)[\s\S]*matchesShortcut\(event, "open-workbench"\)[\s\S]*matchesShortcut\(event, "open-canvas"\)[\s\S]*role="menuitem"[\s\S]*<span>键盘快捷键<\/span>/,
    titleBar,
  ],
  [
    "command palette makes the shortcut help discoverable",
    /id: "keyboard-shortcuts"[\s\S]*label: "键盘快捷键"[\s\S]*case "keyboard-shortcuts"[\s\S]*setShortcutHelpOpen\(true\)/,
    titleBar,
  ],
  [
    "workbench supports fast new-workflow and search focus paths without firing in editors",
    /onWorkbenchKeyDown[\s\S]*isEditableShortcutTarget\(event\.target\)[\s\S]*matchesShortcut\(event, "new-workflow"\)[\s\S]*createWorkflow\(\)[\s\S]*matchesShortcut\(event, "focus-workflow-search"\)[\s\S]*searchInputRef\.current\?\.focus\(\)/,
    workbench,
  ],
  [
    "canvas supports save, run, fit-view, and two-speed keyboard node movement",
    /matchesShortcut\(event, "save-workflow"\)[\s\S]*save\(graphSignature[\s\S]*matchesShortcut\(event, "run-preview"\)[\s\S]*workflowCommands\.testRun\(\)[\s\S]*matchesShortcut\(event, "fit-view"\)[\s\S]*fitView[\s\S]*matchesShortcut\(event, "nudge-node-fast"\)[\s\S]*nudgeNode\(selectedId, event\.key, 24\)[\s\S]*matchesShortcut\(event, "nudge-node"\)[\s\S]*nudgeNode\(selectedId, event\.key, 8\)/,
    canvas,
  ],
  [
    "canvas Escape closes only the topmost surface before clearing selection",
    /matchesShortcut\(event, "close-layer"\)[\s\S]*if \(renameOpen\)[\s\S]*return;[\s\S]*if \(paletteOpen\)[\s\S]*return;[\s\S]*if \(menu\)[\s\S]*return;[\s\S]*if \(inspectingId\)[\s\S]*return;[\s\S]*setSelectedId\(null\)/,
    canvas,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} keyboard shortcut product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Keyboard shortcut product contract passed.");
