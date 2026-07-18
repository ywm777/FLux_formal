# Desktop Canvas Session Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Keep the existing dirty worktree intact and stage only the locked file set for each task.

**Goal:** Remove workflow loading, persistence, conflict classification, and autosave lifecycle from `CanvasView` while preserving the current workbench, canvas, local/cloud, and conflict-recovery behavior.

**Architecture:** A typed `WorkspaceRepositoryPort` defines the application-facing persistence capability. The existing local/cloud selector becomes an adapter behind an injected React provider. A framework-free `WorkflowSessionService` owns restore/open/save/publish use cases, while a canvas-local `useCanvasSession` hook translates ReactFlow state into workflow graphs and owns React lifecycle concerns. `CanvasView` remains the canvas composition and editing adapter; it no longer imports concrete repositories or infrastructure errors.

**Tech Stack:** TypeScript 5.5, React 18, Zustand 4, ReactFlow 12, Node.js 24 built-in test runner, pnpm 10, Vite 5, Tauri 2.

**Source design:** `docs/superpowers/specs/2026-07-18-architecture-convergence-design.md`

---

## Locked File Map

### Create

- `apps/desktop/src/features/workspace/application/workspaceRepositoryPort.ts`
- `apps/desktop/src/features/workspace/application/workflowSessionService.ts`
- `apps/desktop/src/app/WorkspaceServiceProvider.tsx`
- `apps/desktop/src/features/canvas/session/useCanvasSession.ts`
- `apps/desktop/test/workflow-session-service.test.mts`
- `apps/desktop/test/workspace-service-provider.contract.mjs`
- `apps/desktop/test/canvas-session-boundary.contract.mjs`

### Modify

- `apps/desktop/src/main.tsx`
- `apps/desktop/src/lib/workspaceRepository.ts`
- `apps/desktop/src/lib/localWorkspaceRepository.ts`
- `apps/desktop/src/features/canvas/CanvasView.tsx`
- `apps/desktop/test/local-first-workspace.contract.mjs`
- `apps/desktop/test/conflict-dialog-product.contract.mjs`
- `e2e/conflict-contract.spec.ts`
- `apps/desktop/package.json` only if the existing unit-test script cannot run both test files without changing unrelated dependencies.

### Do Not Modify In This Phase

- Canvas layout, node rendering, selection, history, connection, keyboard, or styling behavior.
- Workbench repository calls, task-store repository calls, sharing infrastructure, or execution infrastructure.
- `openWorkflowNonce` and `newWorkflowNonce`; this phase moves their lifecycle handling out of `CanvasView`, and a later command slice removes the signals themselves.
- Workflow schema versions or persisted user data.

---

## Task 1: Define the Workspace Application Port

**Files:**
- Create: `apps/desktop/src/features/workspace/application/workspaceRepositoryPort.ts`
- Create: `apps/desktop/test/workflow-session-service.test.mts`

- [ ] Write a failing type-level/unit import test for `WorkspaceRepositoryPort`, `SaveWorkflowPatch`, and `WorkflowVersionConflictError`.
- [ ] Define the repository capability with `list`, `get`, `create`, `update`, `publish`, `favorite`, `remove`, `importLocal`, and `copyCloudRecordToLocal` methods using shared workflow DTOs.
- [ ] Define one infrastructure-neutral `WorkflowVersionConflictError` carrying `currentVersion` and `expectedVersion`.
- [ ] Run the test and desktop typecheck.
- [ ] Commit only the port and its initial test with `feat: define workspace repository port`.

## Task 2: Put Existing Local and Cloud Implementations Behind the Port

**Files:**
- Create: `apps/desktop/src/app/WorkspaceServiceProvider.tsx`
- Create: `apps/desktop/test/workspace-service-provider.contract.mjs`
- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/lib/workspaceRepository.ts`
- Modify: `apps/desktop/src/lib/localWorkspaceRepository.ts`
- Modify: `apps/desktop/test/local-first-workspace.contract.mjs`

- [ ] Write a failing provider contract requiring an injected `WorkspaceRepositoryPort` and composition-root wiring.
- [ ] Make the existing active repository explicitly satisfy `WorkspaceRepositoryPort` while preserving dynamic local/cloud selection.
- [ ] Translate cloud HTTP 409 `WORKFLOW_VERSION_CONFLICT` failures into `WorkflowVersionConflictError` inside the adapter.
- [ ] Replace `LocalWorkflowVersionConflictError` with the same application error in the local adapter.
- [ ] Add `WorkspaceServiceProvider` and `useWorkspaceRepository`; install it in `main.tsx` above the app.
- [ ] Update the local-first contract to assert the shared application error rather than an adapter-specific class.
- [ ] Run provider/local-first contracts, the unit test, and desktop typecheck.
- [ ] Commit the locked task files with `refactor: inject workspace repository port`.

## Task 3: Add Framework-Free Workflow Session Use Cases

**Files:**
- Modify: `apps/desktop/src/features/workspace/application/workflowSessionService.ts`
- Modify: `apps/desktop/test/workflow-session-service.test.mts`

- [ ] Add failing behavioral tests for: requested-workflow restore, pending-new-draft restore, latest-workflow restore, create-on-first-save, optimistic update, and publish-after-save.
- [ ] Implement `createWorkflowSessionService(repository)` without React, Zustand, ReactFlow, Tauri, or API imports.
- [ ] Keep restore race cancellation in the React hook; the service only performs deterministic use cases.
- [ ] Run the service tests and desktop typecheck.
- [ ] Commit with `feat: add workflow session application service`.

## Task 4: Extract the Canvas Session Lifecycle Hook

**Files:**
- Create: `apps/desktop/src/features/canvas/session/useCanvasSession.ts`
- Create: `apps/desktop/test/canvas-session-boundary.contract.mjs`
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx`

- [ ] Write a failing boundary contract requiring `CanvasView` to use `useCanvasSession` and forbidding concrete workspace repository, API error, local conflict error, direct `get/create/update/publish`, autosave timers, and open/new nonce listener refs in `CanvasView`.
- [ ] Implement the hook with injected repository access, `WorkflowSessionService`, initial restore, explicit open, new-draft reset, autosave debounce, signature tracking, and cancellation guards.
- [ ] Accept canvas adapter callbacks for graph application, draft reset, graph serialization, and current signature so ReactFlow types do not enter the workspace application layer.
- [ ] Expose `saveNow`, `publish`, `conflict`, `keepLocalVersion`, and `useStoredVersion` from the hook.
- [ ] Move only persistence/session effects from `CanvasView`; retain graph editing and transient canvas reset details in `CanvasView` callbacks.
- [ ] Run the new boundary contract, existing open/new/local-first/conflict contracts, service tests, and desktop typecheck.
- [ ] Commit with `refactor: extract canvas session lifecycle`.

## Task 5: Reconnect Workflow Commands and Conflict UI

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx`
- Modify: `apps/desktop/test/conflict-dialog-product.contract.mjs`
- Modify: `e2e/conflict-contract.spec.ts`

- [ ] Update the workflow command registration so save and publish call the hook, while share and test-run reuse `saveNow` before their existing behavior.
- [ ] Route `ConflictDialog` actions through `keepLocalVersion` and `useStoredVersion`; remove duplicate repository reload logic from JSX callbacks.
- [ ] Update source contracts to assert the session boundary rather than implementation text from the old component.
- [ ] Run affected contracts, workflow coordinator unit tests, Playwright conflict tests, and desktop typecheck.
- [ ] Commit with `refactor: route canvas persistence through session`.

## Task 6: Verify the Session-Decomposition Checkpoint

**Files:**
- Verify all files touched by Tasks 1–5.

- [ ] Prove `CanvasView.tsx` has no imports or calls to `workspaceRepository`, `LocalWorkflowVersionConflictError`, `ApiError`, or direct workspace persistence methods.
- [ ] Run `pnpm --filter @flux/desktop test:unit` and all new/affected contracts.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm --filter @flux/desktop build`.
- [ ] Run `pnpm test:integrity`.
- [ ] Confirm the `Flux 无界工作流` desktop process responds and port 5173 listens; restart Tauri dev only if absent.
- [ ] Record `git status --short` and the phase commit list, confirming unrelated existing changes remain unstaged.

---

## Exit Criteria

1. `CanvasView` no longer knows whether persistence is local or cloud.
2. Local and cloud optimistic-lock conflicts reach the UI as one application error.
3. Restore, open, save, publish, autosave, and conflict recovery behavior remains covered.
4. ReactFlow types remain in the canvas feature and do not enter the workspace application port or session service.
5. The application builds, passes integrity tests, and starts after every commit.

## Follow-On Boundary

After this checkpoint, remove `openWorkflowNonce` and `newWorkflowNonce` through typed navigation/session commands, then split canvas editing/history/selection controllers in separate vertical slices.
