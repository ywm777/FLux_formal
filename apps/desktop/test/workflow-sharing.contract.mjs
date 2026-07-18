import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dirname, "..");
const repository = resolve(desktop, "../..");
const api = readFileSync(resolve(desktop, "src/lib/api.ts"), "utf8");
const store = readFileSync(resolve(desktop, "src/store/canvasStore.ts"), "utf8");
const workflowCommandCoordinator = readFileSync(
  resolve(desktop, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
const titleBar = readFileSync(resolve(desktop, "src/components/TitleBar.tsx"), "utf8");
const canvas = readFileSync(resolve(desktop, "src/features/canvas/CanvasView.tsx"), "utf8");
const canvasSession = readFileSync(
  resolve(desktop, "src/features/canvas/session/useCanvasSession.ts"),
  "utf8",
);
const workbench = readFileSync(resolve(desktop, "src/features/workbench/WorkbenchView.tsx"), "utf8");
const dialog = readFileSync(resolve(desktop, "src/features/sharing/ShareWorkflowDialog.tsx"), "utf8");
const sharedView = readFileSync(resolve(desktop, "src/features/sharing/SharedWorkflowView.tsx"), "utf8");
const app = readFileSync(resolve(desktop, "src/App.tsx"), "utf8");
const service = readFileSync(
  resolve(repository, "apps/api/src/modules/workflows/workflows.service.ts"),
  "utf8",
);

const requirements = [
  [
    "workflow API supports share status, enable, revoke, public read, and authenticated copy",
    /getShare:[\s\S]*\/workflows\/\$\{id\}\/share[\s\S]*enableShare:[\s\S]*method: "POST"[\s\S]*disableShare:[\s\S]*method: "DELETE"[\s\S]*getShared:[\s\S]*\/workflow-shares\/[\s\S]*copyShared:[\s\S]*\/copy/,
    api,
  ],
  [
    "workflow commands and title bar expose one integrated share command",
    (source) =>
      /share: \(\) => invoke\("share"\)/.test(workflowCommandCoordinator) &&
      /id: "share"/.test(source) &&
      /role="menuitem"[\s\S]*disabled=\{shareDisabled\}[\s\S]*workflowCommands\.share\(\)[\s\S]*\{sharing \? "正在准备分享" : "分享工作流"\}/.test(source),
    titleBar,
  ],
  [
    "canvas saves the latest graph before opening the share dialog",
    (source) =>
      /const onShare = useCallback[\s\S]*await saveNow\(\)[\s\S]*setShareOpen\(true\)[\s\S]*<ShareWorkflowDialog/.test(source) &&
      /const saveNow = useCallback[\s\S]*persist\(signatureRef\.current, "save"\)/.test(canvasSession),
    canvas,
  ],
  [
    "workbench offers share from both row actions and its custom context menu",
    (source) =>
      /label: "分享工作流"/.test(source) &&
      /aria-label=\{`分享 \$\{workflow\.title\}`\}/.test(source) &&
      /<ShareWorkflowDialog/.test(source),
    workbench,
  ],
  [
    "share dialog uses a deployable public origin, copies links, previews, and requires confirmation to revoke",
    (source) =>
      /VITE_PUBLIC_APP_URL/.test(source) &&
      /navigator\.clipboard/.test(source) &&
      /target="_blank"/.test(source) &&
      /if \(!confirmRevoke\)/.test(source) &&
      /disableShare\(shareWorkflowId\)/.test(source),
    dialog,
  ],
  [
    "public preview is structurally read-only and preserves visible execution order",
    (source) =>
      /nodesDraggable=\{false\}/.test(source) &&
      /nodesConnectable=\{false\}/.test(source) &&
      /elementsSelectable=\{false\}/.test(source) &&
      /executionStep: stepById/.test(source) &&
      /复制到工作台/.test(source),
    sharedView,
  ],
  [
    "shared route stays visible before login and returns to the copied workflow after authentication",
    (source) =>
      /new URLSearchParams\(window\.location\.search\)\.get\("share"\)/.test(source) &&
      /onRequestLogin=/.test(source) &&
      /requestOpenWorkflow\(workflowId\)/.test(source) &&
      /setMode\("canvas"\)/.test(source),
    app,
  ],
  [
    "public and copied graphs remove private connection configuration",
    (source) =>
      /sanitizeSharedGraph\(record\.graph\)/.test(source) &&
      /copyGraph\(this\.sanitizeSharedGraph\(source\.graph\)/.test(source) &&
      /PRIVATE_CONFIG_KEYS/.test(source),
    service,
  ],
];

const missing = requirements
  .filter(([, requirement, source]) =>
    typeof requirement === "function"
      ? !requirement(source)
      : !requirement.test(source),
  )
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workflow sharing requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workflow sharing contract passed.");
