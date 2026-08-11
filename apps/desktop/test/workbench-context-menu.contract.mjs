import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const workbench = read("apps/desktop/src/features/workbench/WorkbenchView.tsx");
const menu = read("apps/desktop/src/features/canvas/ContextMenu.tsx");
const confirmDialog = read("apps/desktop/src/components/ConfirmDialog.tsx");
const store = read("apps/desktop/src/store/tasksStore.ts");
const api = read("apps/desktop/src/lib/api.ts");

const requirements = [
  [
    "workbench suppresses the native menu and opens a row-specific custom menu",
    (source) =>
      /onContextMenu=\{\(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*closest\("\.workbench-workflow-row"\)/.test(source) &&
      /className="workbench-workflow-row"[\s\S]*onContextMenu=\{\(event\)[\s\S]*workflowId: workflow\.id/.test(source),
    workbench,
  ],
  [
    "workflow menu exposes open, favorite, and destructive delete actions with icons",
    /contextMenuItems[\s\S]*label: "打开"[\s\S]*WorkflowMenuIcon kind="open"[\s\S]*取消收藏[\s\S]*WorkflowMenuIcon kind="favorite"[\s\S]*label: "删除工作流"[\s\S]*WorkflowMenuIcon kind="delete"[\s\S]*danger: true/,
    workbench,
  ],
  [
    "delete action requires a named confirmation dialog before calling the store",
    /confirmDeleteWorkflow[\s\S]*await removeWorkflow\(deleteTarget\.id\)[\s\S]*<ConfirmDialog[\s\S]*title="删除工作流"[\s\S]*删除后无法恢复[\s\S]*confirmLabel="删除"/,
    workbench,
  ],
  [
    "workflow store removes the record only after the API succeeds and surfaces failures",
    /removeWorkflow: \(id: string\) => Promise<void>[\s\S]*const scope = get\(\)\.scope \?\? "local"[\s\S]*await repositoryFor\(scope\)\.remove\(id\)[\s\S]*filter\(\(workflow\) => workflow\.id !== id\)[\s\S]*formatProductErrorMessage\(err, "删除工作流失败"\)/,
    store,
  ],
  [
    "desktop API uses the owned workflow DELETE endpoint",
    /remove: \(id: string\) =>[\s\S]*`\/workflows\/\$\{id\}`[\s\S]*method: "DELETE"/,
    api,
  ],
  [
    "custom menu is keyboard operable and exposes menu semantics",
    /role="menu"[\s\S]*aria-label=\{ariaLabel\}[\s\S]*ArrowDown[\s\S]*ArrowUp[\s\S]*role="menuitem"/,
    menu,
  ],
  [
    "destructive confirmation is modal, focuses cancel, traps tab, and supports Escape",
    (source) =>
      /role="alertdialog"[\s\S]*aria-modal="true"/.test(source) &&
      /cancelRef\.current\?\.focus\(\)/.test(source) &&
      /event\.key === "Escape"/.test(source) &&
      /event\.key === "Tab"/.test(source),
    confirmDialog,
  ],
];

const missing = requirements
  .filter(([, check, source]) => typeof check === "function" ? !check(source) : !check.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workbench context-menu requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench custom context-menu contract passed.");
