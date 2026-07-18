import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const titleBar = read("src/components/TitleBar.tsx");
const canvas = read("src/features/canvas/CanvasView.tsx");
const store = read("src/store/canvasStore.ts");
const app = read("src/App.tsx");
const workbench = read("src/features/workbench/WorkbenchView.tsx");

const requirements = [
  [
    "title bar saves through the workflow command boundary",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*workflowCommands\.save\(\)/,
    titleBar,
  ],
  [
    "the active canvas session registers the persisted save path",
    /useCanvasSession\(\{[\s\S]*useRegisterWorkflowCommands\(\{[\s\S]*save: async \(\) =>[\s\S]*saveNow\(\)/,
    canvas,
  ],
  [
    "title bar publishes, shares, and runs through workflow commands",
    /workflowCommands\.testRun\(\)[\s\S]*workflowCommands\.publish\(\)[\s\S]*workflowCommands\.share\(\)/,
    titleBar,
  ],
  [
    "the active canvas session owns publish, share, and test-run handlers",
    /useRegisterWorkflowCommands\(\{[\s\S]*publish: onPublish[\s\S]*share: onShare[\s\S]*testRun: onTestRun/,
    canvas,
  ],
  [
    "workbench opens and creates workflows through typed commands",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*workflowCommands\.createDraft\([\s\S]*workflowCommands\.openWorkflow\(workflowId\)/,
    workbench,
  ],
  [
    "title bar and shared-copy flow use the same navigation commands",
    (source) =>
      /workflowCommands\.createDraft\(/.test(titleBar) &&
      /workflowCommands\.openWorkflow\(workflowId\)/.test(source),
    app,
  ],
  [
    "active canvas session registers workflow navigation handlers",
    /useRegisterWorkflowCommands\(\{[\s\S]*openWorkflow[\s\S]*createDraft/,
    canvas,
  ],
];

const forbidden = [
  ["canvas state does not carry save commands", /saveNonce|requestSave/, store],
  ["canvas does not listen for save command counters", /saveNonce|seenSaveNonce/, canvas],
  [
    "canvas state does not carry workflow action commands",
    /publishNonce|shareNonce|testRunNonce|requestPublish|requestShare|requestTestRun/,
    store,
  ],
  [
    "canvas does not listen for workflow action counters",
    /publishNonce|shareNonce|testRunNonce|seenShareNonce|seenTestRunNonce/,
    canvas,
  ],
  [
    "canvas state does not carry workflow navigation commands",
    /openWorkflowId|openWorkflowNonce|newWorkflowNonce|newWorkflowPending|templateId|requestOpenWorkflow|requestNewWorkflow|requestTemplateWorkflow/,
    store,
  ],
];

const missing = requirements
  .filter(([, requirement, source]) =>
    typeof requirement === "function"
      ? !requirement(source)
      : !requirement.test(source),
  )
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
