import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const commandButtonSource =
  titleBar.match(
    /<button[\s\S]*aria-label="打开命令面板"[\s\S]*?<\/button>/,
  )?.[0] ?? "";

const requirements = [
  [
    "title bar imports and renders the shared command palette",
    /import \{ CommandPalette[\s\S]*type CommandItem[\s\S]*\} from "@flux\/ui";[\s\S]*<CommandPalette[\s\S]*open=\{commandOpen\}/,
    titleBar,
  ],
  [
    "title bar exposes a compact command button",
    /aria-label="打开命令面板"[\s\S]*aria-keyshortcuts="Control\+K Meta\+K"[\s\S]*title=\{`命令面板 \(\$\{shortcutLabel\("command-palette"\)\}\)`\}[\s\S]*setCommandOpen\(true\)/,
    titleBar,
  ],
  [
    "command button remains icon-only while preserving accessible label and tooltip",
    /aria-label="打开命令面板"[\s\S]*aria-keyshortcuts="Control\+K Meta\+K"[\s\S]*onClick=\{\(\) => \{[\s\S]*setCommandOpen\(true\)[\s\S]*\}\}[\s\S]*<svg[\s\S]*aria-hidden/,
    commandButtonSource,
  ],
  [
    "Ctrl K and Meta K open the command palette globally",
    /matchesShortcut\(event, "command-palette"\)[\s\S]*event\.preventDefault\(\)[\s\S]*setCommandOpen\(true\)/,
    titleBar,
  ],
  [
    "command palette includes navigation and workflow commands",
    /id:\s*"new-workflow"[\s\S]*id:\s*"open-canvas"[\s\S]*id:\s*"open-workbench"/,
    titleBar,
  ],
  [
    "command palette includes canvas-only rich actions",
    /mode === "canvas"[\s\S]*id:\s*"add-node"[\s\S]*id:\s*"rename-workflow"[\s\S]*id:\s*"test-run"[\s\S]*id:\s*"publish"/,
    titleBar,
  ],
  [
    "command palette search uses ability language instead of implementation wording",
    /placeholder="搜索命令、能力或页面"/,
    titleBar,
  ],
  [
    "command selection dispatches through existing product actions",
    /function onCommandSelect\(item: CommandItem\)[\s\S]*workflowCommands\.createDraft\([\s\S]*requestAddNode\(\)[\s\S]*requestRenameWorkflow\(\)[\s\S]*workflowCommands\.testRun\(\)[\s\S]*workflowCommands\.publish\(\)/,
    titleBar,
  ],
  [
    "canvas store exposes command request signals for add-node and rename",
    /addNodeNonce:\s*number[\s\S]*renameWorkflowNonce:\s*number[\s\S]*requestAddNode:\s*\(\) => void[\s\S]*requestRenameWorkflow:\s*\(\) => void/,
    canvasStore,
  ],
  [
    "canvas listens for command-triggered add-node requests and opens the local node palette",
    /const addNodeNonce = useCanvasStore\(\(s\) => s\.addNodeNonce\)[\s\S]*seenAddNodeNonce[\s\S]*openNodePaletteAtScreenPoint\(\{[\s\S]*window\.innerWidth \/ 2[\s\S]*window\.innerHeight/,
    canvasView,
  ],
  [
    "canvas listens for command-triggered rename requests and opens the rename drawer",
    /const renameWorkflowNonce = useCanvasStore\(\(s\) => s\.renameWorkflowNonce\)[\s\S]*seenRenameWorkflowNonce[\s\S]*openWorkflowRename\(\)/,
    canvasView,
  ],
];

const forbidden = [
  [
    "command button does not show keyboard shortcut text in the top bar",
    />\s*Ctrl K\s*</,
    commandButtonSource,
  ],
  [
    "global command palette does not replace the contextual canvas node palette",
    /import \{ CommandPalette[\s\S]*from "@flux\/ui"[\s\S]*<CommandPalette/,
    canvasView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} global command palette requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden command palette pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Global command palette contract passed.");
