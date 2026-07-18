import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const titleBar = read("src/components/TitleBar.tsx");
const canvas = read("src/features/canvas/CanvasView.tsx");
const store = read("src/store/canvasStore.ts");

const requirements = [
  [
    "title bar saves through the workflow command boundary",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*workflowCommands\.save\(\)/,
    titleBar,
  ],
  [
    "the active canvas session registers the persisted save path",
    /useRegisterWorkflowCommands\(\{[\s\S]*save: async \(\) =>[\s\S]*save\(graphSignature\(nodes, edges, workflowTitle, groups\)\)/,
    canvas,
  ],
];

const forbidden = [
  ["canvas state does not carry save commands", /saveNonce|requestSave/, store],
  ["canvas does not listen for save command counters", /saveNonce|seenSaveNonce/, canvas],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workflow save boundary requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden save signal(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workflow save command boundary contract passed.");
