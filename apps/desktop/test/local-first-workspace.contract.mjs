import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(desktop, "../..");
const readDesktop = (path) => readFileSync(resolve(desktop, path), "utf8");
const app = readDesktop("src/App.tsx");
const workspaceStore = readDesktop("src/store/workspaceStore.ts");
const repository = readDesktop("src/lib/workspaceRepository.ts");
const localRepository = readDesktop("src/lib/localWorkspaceRepository.ts");
const localExecution = readDesktop("src/lib/localExecution.ts");
const executionGateway = readDesktop("src/lib/executionGateway.ts");
const workbench = readDesktop("src/features/workbench/WorkbenchView.tsx");
const workbenchService = readDesktop(
  "src/features/workbench/application/workbenchService.ts",
);
const workflowFileAdapter = readDesktop(
  "src/infrastructure/browser/workflowFileAdapter.ts",
);
const titleBar = readDesktop("src/components/TitleBar.tsx");
const canvas = readDesktop("src/features/canvas/CanvasView.tsx");
const workflowCommands = readDesktop("src/app/WorkflowCommandProvider.tsx");
const canvasSession = readDesktop("src/features/canvas/session/useCanvasSession.ts");
const workflowSession = readDesktop("src/features/workspace/application/workflowSessionService.ts");
const shareDialog = readDesktop("src/features/sharing/ShareWorkflowDialog.tsx");
const sharingService = readDesktop(
  "src/features/sharing/application/sharingService.ts",
);
const cloudSharingAdapter = readDesktop(
  "src/infrastructure/cloud/cloudWorkflowSharingAdapter.ts",
);
const runtime = readFileSync(
  resolve(repositoryRoot, "packages/workflow-runtime/src/runtime.ts"),
  "utf8",
);
const apiEngine = readFileSync(
  resolve(repositoryRoot, "apps/api/src/modules/executions/engine.ts"),
  "utf8",
);
const rustStorage = readDesktop("src-tauri/src/lib.rs");

const requirements = [
  [
    "the application boots a local workspace independently from authentication",
    (source) =>
      /bootstrapWorkspace\(\)/.test(source) &&
      /cloudLoginOpen/.test(source) &&
      !/status === "unauthenticated" \? \([\s\S]*<LoginView/.test(source),
    app,
  ],
  [
    "local is the default persisted workspace mode",
    (source) =>
      /WORKSPACE_PREFERENCE_KEY = "workspace-preference"/.test(source) &&
      /kind: "local"/.test(source) &&
      /stored === "cloud" \? "cloud" : "local"/.test(source),
    workspaceStore,
  ],
  [
    "workflow CRUD is routed through one workspace repository",
    /export function createWorkspaceRepository\(\s*kind: WorkspaceKind,[\s\S]*const local = kind === "local"[\s\S]*local \? localWorkspaceRepository\.list\(\) : cloudWorkflowApi\.list\(\)[\s\S]*localWorkspaceRepository\.update\(id, patch\)[\s\S]*cloudWorkflowApi\.update\(id, patch\)/,
    repository,
  ],
  [
    "local workflow records persist through the desktop storage boundary",
    /STORAGE_KEY = "local-workspace"[\s\S]*desktopStorage\.read[\s\S]*desktopStorage\.write[\s\S]*WorkflowVersionConflictError/,
    localRepository,
  ],
  [
    "local workflow reads and writes cross the shared schema migration boundary",
    (source) =>
      /import \{ parseGraph \} from "@flux\/workflow-schema"/.test(source) &&
      /graph: parseGraph\(graph\)/.test(source) &&
      /record\.graph = parseGraph\(record\.graph\)/.test(source) &&
      /patch\.graph !== undefined\) record\.graph = parseGraph\(patch\.graph\)/.test(source),
    localRepository,
  ],
  [
    "local and cloud execution share one dispatcher and runtime",
    (source) =>
      /runLocalDraftExecution/.test(source) &&
      /runCloudDraftExecution/.test(source) &&
      /kind === "local"/.test(source) &&
      /local_exec_/.test(source),
    executionGateway,
  ],
  [
    "local execution validates, runs, reports, and persists shared-runtime results",
    (source) =>
      /prepareWorkflowForExecution/.test(source) &&
      /runWorkflow/.test(source) &&
      /onProgress/.test(source) &&
      /local-executions/.test(source) &&
      /storeExecution/.test(source),
    localExecution,
  ],
  [
    "the API engine re-exports the same standalone runtime",
    /export \* from "@flux\/workflow-runtime"/,
    apiEngine,
  ],
  [
    "the shared runtime owns order, inputs, retries, branches, errors, and approvals",
    (source) =>
      /compileExecutionOrder/.test(source) &&
      /prepareWorkflowForExecution/.test(source) &&
      /getRetryTimes/.test(source) &&
      /activateErrorBranch/.test(source) &&
      /isManualApprovalNode/.test(source),
    runtime,
  ],
  [
    "the workbench exposes local identity plus portable import and export",
    (source) =>
      /本地空间/.test(source) &&
      /accept="\.flux/.test(source) &&
      /workbenchService\.importWorkflow/.test(source) &&
      /workbenchService\.exportWorkflow/.test(source) &&
      /repository\.importLocal/.test(workbenchService) &&
      /repository\.get/.test(workbenchService) &&
      /parseFluxWorkflowFile/.test(workflowFileAdapter) &&
      /downloadFluxWorkflow/.test(workflowFileAdapter),
    workbench,
  ],
  [
    "the title bar exposes local save, cloud publish, and subdued sharing controls",
    (source) =>
      /切换到云端空间/.test(source) &&
      /切换到本地空间/.test(source) &&
      /workspaceKind === "local"/.test(source) &&
      /workflowCommands\.save\(\)/.test(source) &&
      /workspaceKind === "cloud"/.test(source) &&
      /执行工作流/.test(source) &&
      /titlebar-tool-button/.test(source),
    titleBar,
  ],
  [
    "the explicit save command reaches the same persisted graph path as autosave",
    (source) =>
      /useRegisterWorkflowCommands\(\{[\s\S]*save: async \(\)/.test(source) &&
      /saveNow\(\)/.test(source) &&
      /saveNow[\s\S]*persist\(signatureRef\.current, "save"\)/.test(canvasSession) &&
      /repository\.(create|update)/.test(workflowSession) &&
      /export function useWorkflowCommands/.test(workflowCommands),
    canvas,
  ],
  [
    "local sharing exports files or uploads an explicit cloud copy",
    (source) =>
      /导出 \.flux/.test(source) &&
      /sharingService\.exportWorkflow/.test(source) &&
      /sharingService\.enableShare/.test(source) &&
      /repository\.get/.test(sharingService) &&
      /cloud\.createWorkflow/.test(sharingService) &&
      /files\.download/.test(sharingService) &&
      /cloudWorkflowApi\.create/.test(cloudSharingAdapter) &&
      /登录后在线分享/.test(source) &&
      /requestCloudAccess\("share"\)/.test(source),
    shareDialog,
  ],
  [
    "desktop storage uses a temporary file and recoverable backup",
    (source) =>
      /storage_sidecar/.test(source) &&
      /"tmp"/.test(source) &&
      /"bak"/.test(source) &&
      /sync_all/.test(source) &&
      /fs::rename/.test(source),
    rustStorage,
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
  console.error(`Missing ${missing.length} Local-first requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Local-first workspace contract passed.");
