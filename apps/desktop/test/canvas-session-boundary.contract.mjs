import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canvas = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);

let sessionHook = "";
try {
  sessionHook = readFileSync(
    resolve(root, "src/features/canvas/session/useCanvasSession.ts"),
    "utf8",
  );
} catch {
  // The red phase intentionally starts before the hook exists.
}

const requirements = [
  [
    "canvas delegates persistence lifecycle to the session hook",
    /useCanvasSession\(\{[\s\S]*applyWorkflowRecord[\s\S]*resetCanvasDraft[\s\S]*createGraph[\s\S]*signature/,
    canvas,
  ],
  [
    "session hook composes the injected repository and pure application service",
    /useWorkspaceRepository\(\)[\s\S]*createWorkflowSessionService\(repository\)/,
    sessionHook,
  ],
  [
    "session hook owns restore, autosave, and version conflict lifecycle",
    (source) =>
      /openWorkflowNonce/.test(source) &&
      /newWorkflowNonce/.test(source) &&
      /AUTOSAVE_DEBOUNCE_MS/.test(source) &&
      /WorkflowVersionConflictError/.test(source),
    sessionHook,
  ],
];

const forbidden = [
  [
    "canvas does not import concrete workspace persistence",
    /workspaceRepository|LocalWorkflowVersionConflictError|ApiError/,
    canvas,
  ],
  [
    "canvas does not own persistence timers or navigation signal listeners",
    /saveTimer|seenOpenWorkflowNonce|seenNewWorkflowNonce/,
    canvas,
  ],
  [
    "canvas does not call concrete workspace persistence methods",
    /\.get\(openWorkflowId\)|\.create\(workflowTitle|\.update\(store\.workflowId|\.publish\(id\)/,
    canvas,
  ],
];

const missing = requirements
  .filter(([, requirement, source]) =>
    typeof requirement === "function"
      ? !requirement(source)
      : !requirement.test(source),
  )
  .map(([label]) => label);
const violations = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || violations.length > 0) {
  throw new Error(
    [
      ...missing.map((label) => `missing: ${label}`),
      ...violations.map((label) => `violation: ${label}`),
    ].join("; "),
  );
}

console.log("Canvas session boundary contract passed.");
