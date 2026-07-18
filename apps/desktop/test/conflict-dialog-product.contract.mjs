import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const conflictDialog = readFileSync(
  resolve(root, "src/features/canvas/ConflictDialog.tsx"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const canvasSession = readFileSync(
  resolve(root, "src/features/canvas/session/useCanvasSession.ts"),
  "utf8",
);

const requirements = [
  [
    "conflict dialog keeps version props for conflict resolution logic",
    /localVersion: number[\s\S]*remoteVersion: number/,
    conflictDialog,
  ],
  [
    "conflict dialog uses user-facing conflict copy without exposing version numbers",
    /本地修改与云端内容不一致。请选择要保留的内容。/,
    conflictDialog,
  ],
  [
    "canvas still passes local and remote versions to preserve conflict resolution behavior",
    /<ConflictDialog[\s\S]*localVersion=\{conflict\?\.localVersion \?\? 0\}[\s\S]*remoteVersion=\{conflict\?\.remoteVersion \?\? 0\}/,
    canvasView,
  ],
  [
    "conflict actions delegate to the canvas session controller",
    /onKeepLocal=\{\(\) => void keepLocalVersion\(\)\}[\s\S]*onUseRemote=\{useStoredVersion\}/,
    canvasView,
  ],
  [
    "canvas session retries local state from the stored version and can reload storage",
    /setVersion\(conflict\.remoteVersion\)[\s\S]*saveNow\(\)[\s\S]*session\.open\(workflowId\)/,
    canvasSession,
  ],
];

const forbidden = [
  [
    "conflict dialog does not show raw local version numbers",
    /本地 v\{localVersion\}|localVersion\} 与/,
    conflictDialog,
  ],
  [
    "conflict dialog does not show raw remote version numbers",
    /云端 v\{remoteVersion\}|remoteVersion\} 不一致/,
    conflictDialog,
  ],
  [
    "conflict dialog does not ask users to choose between abstract versions",
    /哪一版/,
    conflictDialog,
  ],
  [
    "canvas view does not perform conflict persistence directly",
    /setVersion\(conflict\.remoteVersion\)|workspaceRepository\.get/,
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
  console.error(`Missing ${missing.length} conflict dialog requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden conflict dialog pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Conflict dialog product contract passed.");
