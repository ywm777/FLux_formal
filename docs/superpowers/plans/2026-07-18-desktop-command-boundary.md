# Desktop Command Boundary Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a clean verification baseline and replace the desktop canvas command nonces with one typed, testable workflow-command boundary without changing Flux product behavior.

**Architecture:** A pure command coordinator owns the active canvas-session handlers. A React provider exposes stable workflow commands to the title bar and registers the current `CanvasView` session, while Zustand continues to hold observable status only. This phase migrates save, publish, share, and test-run commands but deliberately leaves add-node, insert-node, rename, open, and new-workflow signals for later vertical slices.

**Tech Stack:** TypeScript 5.5, React 18, Zustand 4, Node.js 24 built-in test runner, pnpm 10, Vite 5, Tauri 2.

**Source design:** `docs/superpowers/specs/2026-07-18-architecture-convergence-design.md`

---

## Locked File Map

### Create

- `apps/desktop/src/app/workflowCommandCoordinator.ts` — framework-free command coordinator and command types.
- `apps/desktop/src/app/WorkflowCommandProvider.tsx` — React provider plus public and registration hooks.
- `apps/desktop/test/workflow-command-coordinator.test.mts` — behavioral tests for registration, replacement, cleanup, and failure propagation.
- `apps/desktop/test/workflow-command-provider.contract.mjs` — provider wiring contract.
- `apps/desktop/test/workflow-command-boundary.contract.mjs` — source boundary contract preventing command nonces from returning.

### Modify

- `apps/api/src/modules/executions/executions.service.smoke.ts` — align normalized graph fixtures with the current required port output shape.
- `apps/desktop/package.json` — add the Node-based unit-test script.
- `apps/desktop/src/main.tsx` — install the workflow command provider above the app.
- `apps/desktop/src/components/TitleBar.tsx` — dispatch canvas actions through the command boundary.
- `apps/desktop/src/features/canvas/CanvasView.tsx` — register active session handlers and remove nonce listeners.
- `apps/desktop/src/store/canvasStore.ts` — retain observable state while removing four command-signal fields and actions.
- `apps/desktop/test/canvas-execution-follow.contract.mjs` — assert the typed execution command boundary.
- `apps/desktop/test/canvas-test-run.contract.mjs` — assert test-run state separately from command dispatch.
- `apps/desktop/test/global-command-palette.contract.mjs` — assert command-palette dispatch through the coordinator.
- `apps/desktop/test/keyboard-shortcuts-product.contract.mjs` — assert keyboard execution through the same command path.
- `apps/desktop/test/local-first-workspace.contract.mjs` — assert explicit save through the coordinator and the existing persistence path.
- `apps/desktop/test/titlebar-canvas-actions.contract.mjs` — assert title-bar actions use the coordinator.
- `apps/desktop/test/workbench-launchpad-boundary.contract.mjs` — assert publish remains a canvas-scoped command.
- `apps/desktop/test/workbench-run-panel-product.contract.mjs` — assert the workbench does not own execution and the canvas registers it.
- `apps/desktop/test/workflow-sharing.contract.mjs` — assert the integrated share command uses the coordinator.

### Do Not Modify In This Phase

- `packages/*` public contracts, except rebuilding them during verification.
- API execution behavior, database adapters, or queue behavior.
- Canvas visual layout, node rendering, graph editing, autosave timing, or user-facing copy.
- `addNodeNonce`, `insertNodeNonce`, `renameWorkflowNonce`, `openWorkflowNonce`, or `newWorkflowNonce`.

---

### Task 1: Restore the Existing Typecheck Baseline

**Files:**
- Modify: `apps/api/src/modules/executions/executions.service.smoke.ts:23-102`
- Test: `apps/api/src/modules/executions/executions.service.smoke.ts`

- [ ] **Step 1: Reproduce the normalized-port fixture failure**

Run:

```powershell
pnpm --filter @flux/api typecheck
```

Expected: FAIL with seven `TS2741` errors stating that `capacity` is missing from port objects.

- [ ] **Step 2: Confirm the root cause before editing**

Run:

```powershell
rg -n -C 3 'capacity|WorkflowGraphSchema' packages/workflow-schema/src/schema.ts apps/desktop/src/features/canvas/graphBridge.ts apps/api/src/modules/executions/executions.service.smoke.ts
```

Expected: `PortSchema` defaults normalized output to `capacity: "one"`, `graphBridge` writes that value, and only the handwritten API smoke fixtures omit it.

- [ ] **Step 3: Update every normalized fixture port**

In `validGraph`, use:

```ts
ports: {
  inputs: [],
  outputs: [
    { id: "out", name: "out", dataType: "any", capacity: "one" },
  ],
},
```

In `approvalGraph`, use:

```ts
ports: {
  inputs: [
    { id: "in", name: "in", dataType: "any", capacity: "one" },
  ],
  outputs: [
    {
      id: "approved",
      name: "approved",
      dataType: "any",
      capacity: "one",
    },
    {
      id: "rejected",
      name: "rejected",
      dataType: "any",
      capacity: "one",
    },
  ],
},
```

In `runtimeInputGraph`, use:

```ts
ports: {
  inputs: [],
  outputs: [
    { id: "out", name: "out", dataType: "any", capacity: "one" },
  ],
},
```

In the `relay` node of `connectedRuntimeInputGraph`, use:

```ts
ports: {
  inputs: [
    { id: "in", name: "上游文本", dataType: "text", capacity: "one" },
  ],
  outputs: [
    { id: "out", name: "文本", dataType: "text", capacity: "one" },
  ],
},
```

- [ ] **Step 4: Verify the API typecheck and runtime smoke test**

Run:

```powershell
pnpm --filter @flux/api typecheck
pnpm build
pnpm --filter @flux/api build
node apps/api/dist/modules/executions/executions.service.smoke.js
```

Expected: all commands exit `0`; the final command prints `executions service smoke passed`.

- [ ] **Step 5: Commit the baseline repair**

```powershell
git add -- apps/api/src/modules/executions/executions.service.smoke.ts
git commit -m "test: align execution fixtures with port schema"
```

Expected: the commit contains only the smoke fixture.

---

### Task 2: Add the Pure Workflow Command Coordinator

**Files:**
- Create: `apps/desktop/test/workflow-command-coordinator.test.mts`
- Create: `apps/desktop/src/app/workflowCommandCoordinator.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Write the failing coordinator tests**

Create `apps/desktop/test/workflow-command-coordinator.test.mts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkflowCommandCoordinator,
  type WorkflowCommandHandlers,
} from "../src/app/workflowCommandCoordinator.ts";

function handlers(
  calls: string[],
  prefix: string,
): WorkflowCommandHandlers {
  return {
    save: async () => { calls.push(`${prefix}:save`); },
    publish: async () => { calls.push(`${prefix}:publish`); },
    share: async () => { calls.push(`${prefix}:share`); },
    testRun: async () => { calls.push(`${prefix}:test-run`); },
  };
}

test("commands are harmless before a canvas session registers", async () => {
  const coordinator = createWorkflowCommandCoordinator();
  await coordinator.commands.save();
  await coordinator.commands.publish();
  await coordinator.commands.share();
  await coordinator.commands.testRun();
});

test("commands reach the active canvas session", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  coordinator.register(handlers(calls, "active"));

  await coordinator.commands.save();
  await coordinator.commands.publish();
  await coordinator.commands.share();
  await coordinator.commands.testRun();

  assert.deepEqual(calls, [
    "active:save",
    "active:publish",
    "active:share",
    "active:test-run",
  ]);
});

test("stale cleanup cannot disconnect a newer canvas session", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  const unregisterFirst = coordinator.register(handlers(calls, "first"));
  const unregisterSecond = coordinator.register(handlers(calls, "second"));

  unregisterFirst();
  await coordinator.commands.save();
  unregisterSecond();
  await coordinator.commands.save();

  assert.deepEqual(calls, ["second:save"]);
});

test("command failures propagate to the caller", async () => {
  const coordinator = createWorkflowCommandCoordinator();
  const failure = new Error("save failed");
  coordinator.register({
    save: async () => { throw failure; },
    publish: async () => undefined,
    share: async () => undefined,
    testRun: async () => undefined,
  });

  await assert.rejects(() => coordinator.commands.save(), failure);
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
node --test apps/desktop/test/workflow-command-coordinator.test.mts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `workflowCommandCoordinator.ts`.

- [ ] **Step 3: Implement the minimal framework-free coordinator**

Create `apps/desktop/src/app/workflowCommandCoordinator.ts`:

```ts
export type WorkflowCommandHandler = () => void | Promise<void>;

export interface WorkflowCommandHandlers {
  save: WorkflowCommandHandler;
  publish: WorkflowCommandHandler;
  share: WorkflowCommandHandler;
  testRun: WorkflowCommandHandler;
}

export interface WorkflowCommands {
  save: () => Promise<void>;
  publish: () => Promise<void>;
  share: () => Promise<void>;
  testRun: () => Promise<void>;
}

export interface WorkflowCommandCoordinator {
  commands: WorkflowCommands;
  register: (handlers: WorkflowCommandHandlers) => () => void;
}

export function createWorkflowCommandCoordinator(): WorkflowCommandCoordinator {
  let activeHandlers: WorkflowCommandHandlers | null = null;

  async function invoke(command: keyof WorkflowCommandHandlers): Promise<void> {
    await activeHandlers?.[command]();
  }

  const commands: WorkflowCommands = {
    save: () => invoke("save"),
    publish: () => invoke("publish"),
    share: () => invoke("share"),
    testRun: () => invoke("testRun"),
  };

  return {
    commands,
    register(handlers) {
      activeHandlers = handlers;
      return () => {
        if (activeHandlers === handlers) activeHandlers = null;
      };
    },
  };
}
```

- [ ] **Step 4: Declare ESM semantics and add the repeatable desktop unit-test script**

Add this top-level field after `private` in `apps/desktop/package.json` so Node and Vite use the same ES Module semantics as the source:

```json
"type": "module"
```

Add this entry under `scripts`:

```json
"test:unit": "node --test test/workflow-command-coordinator.test.mts"
```

- [ ] **Step 5: Run the coordinator tests and desktop typecheck**

Run:

```powershell
pnpm --filter @flux/desktop test:unit
pnpm --filter @flux/desktop typecheck
```

Expected: four coordinator tests pass without `MODULE_TYPELESS_PACKAGE_JSON`, and desktop typecheck exits `0`.

- [ ] **Step 6: Commit the pure coordinator**

```powershell
git add -- apps/desktop/package.json apps/desktop/src/app/workflowCommandCoordinator.ts apps/desktop/test/workflow-command-coordinator.test.mts
git commit -m "feat: add workflow command coordinator"
```

---

### Task 3: Install the React Workflow Command Provider

**Files:**
- Create: `apps/desktop/test/workflow-command-provider.contract.mjs`
- Create: `apps/desktop/src/app/WorkflowCommandProvider.tsx`
- Modify: `apps/desktop/src/main.tsx`

- [ ] **Step 1: Write the failing provider wiring contract**

Create `apps/desktop/test/workflow-command-provider.contract.mjs`:

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");
const provider = readFileSync(
  resolve(root, "src/app/WorkflowCommandProvider.tsx"),
  "utf8",
);

const requirements = [
  [
    "the provider wraps the application once",
    /<WorkflowCommandProvider>[\s\S]*<App \/>[\s\S]*<\/WorkflowCommandProvider>/,
    main,
  ],
  [
    "consumers receive stable public workflow commands",
    /export function useWorkflowCommands[\s\S]*return useCoordinator\(\)\.commands/,
    provider,
  ],
  [
    "the active canvas session registers through a dedicated hook",
    /export function useRegisterWorkflowCommands[\s\S]*handlersRef\.current = handlers[\s\S]*coordinator\.register/,
    provider,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workflow command provider requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workflow command provider contract passed.");
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```powershell
node apps/desktop/test/workflow-command-provider.contract.mjs
```

Expected: FAIL because `WorkflowCommandProvider.tsx` does not exist.

- [ ] **Step 3: Implement the provider and registration hook**

Create `apps/desktop/src/app/WorkflowCommandProvider.tsx`:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  createWorkflowCommandCoordinator,
  type WorkflowCommandCoordinator,
  type WorkflowCommandHandlers,
  type WorkflowCommands,
} from "./workflowCommandCoordinator.js";

const WorkflowCommandContext = createContext<WorkflowCommandCoordinator | null>(
  null,
);

function useCoordinator(): WorkflowCommandCoordinator {
  const coordinator = useContext(WorkflowCommandContext);
  if (!coordinator) {
    throw new Error("WorkflowCommandProvider is missing");
  }
  return coordinator;
}

export function WorkflowCommandProvider({ children }: PropsWithChildren) {
  const [coordinator] = useState(createWorkflowCommandCoordinator);
  return (
    <WorkflowCommandContext.Provider value={coordinator}>
      {children}
    </WorkflowCommandContext.Provider>
  );
}

export function useWorkflowCommands(): WorkflowCommands {
  return useCoordinator().commands;
}

export function useRegisterWorkflowCommands(
  handlers: WorkflowCommandHandlers,
): void {
  const coordinator = useCoordinator();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(
    () => coordinator.register({
      save: () => handlersRef.current.save(),
      publish: () => handlersRef.current.publish(),
      share: () => handlersRef.current.share(),
      testRun: () => handlersRef.current.testRun(),
    }),
    [coordinator],
  );
}
```

- [ ] **Step 4: Wrap the application in the provider**

Update `apps/desktop/src/main.tsx` to:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@flux/ui/tokens.css";
import "./global.css";
import { App } from "./App.js";
import { WorkflowCommandProvider } from "./app/WorkflowCommandProvider.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkflowCommandProvider>
      <App />
    </WorkflowCommandProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Verify provider wiring**

Run:

```powershell
node apps/desktop/test/workflow-command-provider.contract.mjs
pnpm --filter @flux/desktop test:unit
pnpm --filter @flux/desktop typecheck
```

Expected: provider contract and four unit tests pass; typecheck exits `0`.

- [ ] **Step 6: Commit the provider**

```powershell
git add -- apps/desktop/src/main.tsx apps/desktop/src/app/WorkflowCommandProvider.tsx apps/desktop/test/workflow-command-provider.contract.mjs
git commit -m "feat: provide workflow commands to desktop views"
```

---

### Task 4: Migrate the Explicit Save Command

**Files:**
- Create: `apps/desktop/test/workflow-command-boundary.contract.mjs`
- Modify: `apps/desktop/src/components/TitleBar.tsx:45-70,200-230,575-590`
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx:1956-2093`
- Modify: `apps/desktop/src/store/canvasStore.ts:18-136`
- Modify: `apps/desktop/test/local-first-workspace.contract.mjs`

- [ ] **Step 1: Write the failing save-boundary contract**

Create `apps/desktop/test/workflow-command-boundary.contract.mjs`:

```js
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
```

- [ ] **Step 2: Run the contract and verify the old nonce path fails it**

Run:

```powershell
node apps/desktop/test/workflow-command-boundary.contract.mjs
```

Expected: FAIL because the title bar still calls `requestSave` and the store still contains `saveNonce`.

- [ ] **Step 3: Route title-bar save through public commands**

Add this import to `TitleBar.tsx`:

```ts
import { useWorkflowCommands } from "../app/WorkflowCommandProvider.js";
```

Inside `TitleBar`, add:

```ts
const workflowCommands = useWorkflowCommands();
```

Delete the `requestSave` Zustand selector. Replace each title-bar or command-palette save dispatch with:

```ts
void workflowCommands.save();
```

- [ ] **Step 4: Register the current canvas handlers**

Add this import to `CanvasView.tsx`:

```ts
import { useRegisterWorkflowCommands } from "../../app/WorkflowCommandProvider.js";
```

Immediately after `onTestRun` is defined, register the session:

```ts
useRegisterWorkflowCommands({
  save: async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await save(graphSignature(nodes, edges, workflowTitle, groups));
  },
  publish: onPublish,
  share: onShare,
  testRun: onTestRun,
});
```

Delete the `saveNonce`, `seenSaveNonce`, and corresponding `useEffect` block at the current `CanvasView.tsx:2045-2055`. Keep `saveRef` because inactive-view flushing still uses it.

- [ ] **Step 5: Remove only the save command signal from Zustand**

Delete these members and implementations from `canvasStore.ts`:

```ts
saveNonce: number;
requestSave: () => void;
saveNonce: 0,
requestSave: () => set((s) => ({ saveNonce: s.saveNonce + 1 })),
```

Do not remove the publish, share, test-run, add-node, insert-node, rename, open, or new-workflow signals in this task.

- [ ] **Step 6: Update the local-first contract to the new save path**

In `local-first-workspace.contract.mjs`, add:

```js
const workflowCommands = readDesktop("src/app/WorkflowCommandProvider.tsx");
```

Change the title-bar save check to:

```js
/workflowCommands\.save\(\)/.test(source)
```

Replace the explicit-save requirement with:

```js
[
  "the explicit save command reaches the same persisted graph path as autosave",
  (source) =>
    /useRegisterWorkflowCommands\(\{[\s\S]*save: async \(\)/.test(source) &&
    /save\(graphSignature\(nodes, edges, workflowTitle, groups\)\)/.test(source) &&
    /workspaceRepository\.(create|update)/.test(source) &&
    /export function useWorkflowCommands/.test(workflowCommands),
  canvas,
],
```

- [ ] **Step 7: Verify save behavior and boundaries**

Run:

```powershell
node apps/desktop/test/workflow-command-boundary.contract.mjs
node apps/desktop/test/local-first-workspace.contract.mjs
node apps/desktop/test/workflow-command-provider.contract.mjs
pnpm --filter @flux/desktop test:unit
pnpm --filter @flux/desktop typecheck
```

Expected: every command passes.

- [ ] **Step 8: Commit the save migration**

```powershell
git add -- apps/desktop/src/components/TitleBar.tsx apps/desktop/src/features/canvas/CanvasView.tsx apps/desktop/src/store/canvasStore.ts apps/desktop/test/local-first-workspace.contract.mjs apps/desktop/test/workflow-command-boundary.contract.mjs
git commit -m "refactor: route workflow save through command boundary"
```

---

### Task 5: Migrate Publish, Share, and Test-Run Commands

**Files:**
- Modify: `apps/desktop/test/workflow-command-boundary.contract.mjs`
- Modify: `apps/desktop/src/components/TitleBar.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx`
- Modify: `apps/desktop/src/store/canvasStore.ts`
- Modify: the eight remaining product contracts listed in the Locked File Map

- [ ] **Step 1: Extend the failing boundary contract**

Add these requirements to `workflow-command-boundary.contract.mjs`:

```js
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
```

Add these forbidden checks:

```js
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
```

Run:

```powershell
node apps/desktop/test/workflow-command-boundary.contract.mjs
```

Expected: FAIL because the three old nonce paths remain.

- [ ] **Step 2: Route every title-bar workflow action through the coordinator**

Delete the `requestPublish`, `requestShare`, and `requestTestRun` Zustand selectors from `TitleBar.tsx`.

Use these dispatches in the command palette and visible controls:

```ts
void workflowCommands.testRun();
void workflowCommands.publish();
void workflowCommands.share();
```

Keep the existing disabled-state checks and menu-closing behavior around those calls.

- [ ] **Step 3: Route the canvas keyboard shortcut through the same command path**

Import the public hook together with the registration hook:

```ts
import {
  useRegisterWorkflowCommands,
  useWorkflowCommands,
} from "../../app/WorkflowCommandProvider.js";
```

At the start of `CanvasView`, add:

```ts
const workflowCommands = useWorkflowCommands();
```

Replace the `run-preview` shortcut body with:

```ts
if (matchesShortcut(event, "run-preview")) {
  event.preventDefault();
  const store = useCanvasStore.getState();
  if (!store.testing && !store.publishing && store.status !== "saving") {
    void workflowCommands.testRun();
  }
  return;
}
```

Add `workflowCommands` to the keyboard effect dependency array.

- [ ] **Step 4: Delete the remaining workflow-action nonce listeners**

Delete the `publishRef`, `shareRef`, `testRunRef`, `publishNonce`, `shareNonce`, `testRunNonce`, and their listener effects from the current `CanvasView.tsx:2057-2093`. The registered handlers from Task 4 are now the sole title-bar path.

- [ ] **Step 5: Remove only the three migrated signals from Zustand**

Delete these interface fields, initial values, and request implementations from `canvasStore.ts`:

```ts
publishNonce: number;
shareNonce: number;
testRunNonce: number;
requestPublish: () => void;
requestShare: () => void;
requestTestRun: () => void;
publishNonce: 0,
shareNonce: 0,
testRunNonce: 0,
requestPublish: () => set((s) => ({ publishNonce: s.publishNonce + 1 })),
requestShare: () => set((s) => ({ shareNonce: s.shareNonce + 1 })),
requestTestRun: () => set((s) => ({ testRunNonce: s.testRunNonce + 1 })),
```

Keep `publishing`, `sharing`, `testing`, `runProgress`, and their setters because they are observable state.

- [ ] **Step 6: Update the execution and title-bar contracts**

In `canvas-execution-follow.contract.mjs`, add:

```js
const workflowCommandCoordinator = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
```

Then replace the store-signal requirement with:

```js
[
  "workflow commands expose one explicit execution action",
  /testRun: \(\) => invoke\("testRun"\)/,
  workflowCommandCoordinator,
],
```

In `canvas-test-run.contract.mjs`, use these three requirements:

```js
[
  "canvas store exposes running state and top-bar progress",
  /testing:\s*boolean[\s\S]*runProgress:\s*CanvasRunProgress \| null[\s\S]*setTesting:\s*\(testing: boolean\) => void[\s\S]*setRunProgress:\s*\(runProgress: CanvasRunProgress \| null\) => void/,
  canvasStore,
],
[
  "title bar exposes the single canvas execution action",
  /const workflowCommands = useWorkflowCommands\(\)[\s\S]*label:\s*testing \? "工作流执行中" : "执行工作流"[\s\S]*aria-label=\{testing \? "工作流执行中" : "执行工作流"\}[\s\S]*workflowCommands\.testRun\(\)/,
  titleBar,
],
[
  "canvas registers test run handling for the title bar",
  /useRegisterWorkflowCommands\(\{[\s\S]*testRun: onTestRun/,
  canvasView,
],
```

In `titlebar-canvas-actions.contract.mjs`, replace the canvas-scoping requirement with:

```js
[
  "canvas-only top bar actions remain scoped to canvas mode",
  /mode === "canvas"[\s\S]*workflowCommands\.testRun\(\)[\s\S]*workflowCommands\.publish\(\)/,
  titleBar,
],
```

In `workbench-run-panel-product.contract.mjs`, add:

```js
const workflowCommandCoordinator = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
```

Then replace the three signal-based requirements with:

```js
[
  "workflow commands keep one explicit top-bar execution action",
  /testRun: \(\) => invoke\("testRun"\)/,
  workflowCommandCoordinator,
],
[
  "title bar owns the single workflow execution control",
  /aria-label=\{testing \? "工作流执行中" : "执行工作流"\}[\s\S]*workflowCommands\.testRun\(\)/,
  titleBar,
],
[
  "canvas registers the explicit title-bar execution handler",
  /useRegisterWorkflowCommands\(\{[\s\S]*testRun: onTestRun/,
  canvasView,
],
```

- [ ] **Step 7: Update command-palette, keyboard, publish, and sharing contracts**

In `global-command-palette.contract.mjs`, change the dispatch requirement to:

```js
[
  "command selection dispatches through existing product actions",
  /function onCommandSelect\(item: CommandItem\)[\s\S]*requestNewWorkflow\(\)[\s\S]*requestAddNode\(\)[\s\S]*requestRenameWorkflow\(\)[\s\S]*workflowCommands\.testRun\(\)[\s\S]*workflowCommands\.publish\(\)/,
  titleBar,
],
```

In `keyboard-shortcuts-product.contract.mjs`, replace `requestTestRun\(\)` in the canvas shortcut requirement with:

```js
workflowCommands\.testRun\(\)
```

In `workbench-launchpad-boundary.contract.mjs`, use:

```js
[
  "canvas publish stays in the canvas title bar instead of the workbench",
  /mode === "canvas"[\s\S]*workflowCommands\.publish\(\)[\s\S]*发布/,
  titleBar,
],
```

In `workflow-sharing.contract.mjs`, add:

```js
const workflowCommandCoordinator = readFileSync(
  resolve(desktop, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
```

Then replace the integrated-share requirement with:

```js
[
  "workflow commands and title bar expose one integrated share command",
  (source) =>
    /share: \(\) => invoke\("share"\)/.test(workflowCommandCoordinator) &&
    /id: "share"/.test(source) &&
    /role="menuitem"[\s\S]*disabled=\{shareDisabled\}[\s\S]*workflowCommands\.share\(\)[\s\S]*\{sharing \? "正在准备分享" : "分享工作流"\}/.test(source),
  titleBar,
],
```

- [ ] **Step 8: Run every affected contract**

Run:

```powershell
$tests = @(
  'workflow-command-provider.contract.mjs',
  'workflow-command-boundary.contract.mjs',
  'canvas-execution-follow.contract.mjs',
  'canvas-test-run.contract.mjs',
  'global-command-palette.contract.mjs',
  'keyboard-shortcuts-product.contract.mjs',
  'local-first-workspace.contract.mjs',
  'titlebar-canvas-actions.contract.mjs',
  'workbench-launchpad-boundary.contract.mjs',
  'workbench-run-panel-product.contract.mjs',
  'workflow-sharing.contract.mjs'
)
foreach ($test in $tests) {
  node (Join-Path 'apps/desktop/test' $test)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
pnpm --filter @flux/desktop test:unit
pnpm --filter @flux/desktop typecheck
```

Expected: every contract passes, four unit tests pass, and typecheck exits `0`.

- [ ] **Step 9: Commit the remaining command migration**

```powershell
git add -- apps/desktop/src/components/TitleBar.tsx apps/desktop/src/features/canvas/CanvasView.tsx apps/desktop/src/store/canvasStore.ts apps/desktop/test/workflow-command-boundary.contract.mjs apps/desktop/test/canvas-execution-follow.contract.mjs apps/desktop/test/canvas-test-run.contract.mjs apps/desktop/test/global-command-palette.contract.mjs apps/desktop/test/keyboard-shortcuts-product.contract.mjs apps/desktop/test/titlebar-canvas-actions.contract.mjs apps/desktop/test/workbench-launchpad-boundary.contract.mjs apps/desktop/test/workbench-run-panel-product.contract.mjs apps/desktop/test/workflow-sharing.contract.mjs
git commit -m "refactor: replace canvas workflow command nonces"
```

---

### Task 6: Verify the Phase and Produce a Running Checkpoint

**Files:**
- Verify: all files touched in Tasks 1-5

- [ ] **Step 1: Prove the four migrated nonce paths are gone**

Run:

```powershell
rg -n 'saveNonce|publishNonce|shareNonce|testRunNonce|requestSave|requestPublish|requestShare|requestTestRun' apps/desktop/src
```

Expected: no matches and `rg` exits `1`.

- [ ] **Step 2: Run unit and architecture contracts**

Run:

```powershell
pnpm --filter @flux/desktop test:unit
node apps/desktop/test/workflow-command-provider.contract.mjs
node apps/desktop/test/workflow-command-boundary.contract.mjs
node apps/desktop/test/local-first-workspace.contract.mjs
node apps/desktop/test/canvas-test-run.contract.mjs
node apps/desktop/test/workflow-sharing.contract.mjs
```

Expected: all tests exit `0`.

- [ ] **Step 3: Run full repository verification**

Run:

```powershell
pnpm typecheck
pnpm --filter @flux/desktop build
pnpm test:integrity
```

Expected: full typecheck, desktop build, smoke tests, contract tests, and selected Playwright flows pass.

- [ ] **Step 4: Start the desktop application and verify the unchanged product flow**

Run:

```powershell
pnpm --filter @flux/desktop run tauri:dev
```

Expected visible result:

1. `Flux 无界工作流` opens and responds.
2. Workbench and canvas navigation are unchanged.
3. Save, run, publish, and share controls keep their existing labels and disabled states.
4. Save persists the current graph; run projects progress to the title bar and nodes.
5. No duplicate command fires under React Strict Mode.

- [ ] **Step 5: Record the checkpoint status**

Run:

```powershell
git status --short
git log -6 --oneline
```

Expected: the five phase commits are visible, and no unrelated pre-existing workspace changes were staged or removed.

---

## Follow-On Plan Boundaries

After this plan passes, create separate implementation plans in this order:

1. `desktop-canvas-session-decomposition` — extract load/save/conflict and canvas editing controllers.
2. `workflow-schema-migration-boundary` — add schema versioning, migration registry, fixtures, backup, and rollback.
3. `shared-package-boundary-convergence` — enforce responsibilities and dependency direction across six packages.
4. `api-application-adapter-boundary` — align controllers, use cases, repositories, queues, credentials, and providers.
5. `architecture-cleanup-and-docs` — remove compatibility paths, add boundary checks, update documentation, and run final verification.
