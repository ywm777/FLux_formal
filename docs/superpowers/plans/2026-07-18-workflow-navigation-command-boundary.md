# Workflow Navigation Command Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and strict TDD. Preserve the dirty worktree and stage only each task's locked files.

**Goal:** Remove `openWorkflowNonce` and `newWorkflowNonce` as cross-component event signals, replacing them with typed workflow navigation commands that remain reliable even when the canvas session is temporarily unmounted.

**Architecture:** The existing pure workflow command coordinator gains argument-bearing `openWorkflow` and `createDraft` commands. Unlike canvas-only actions, navigation commands queue the latest pending intent and settle it when a canvas session registers. `useCanvasSession` exposes explicit open/create operations with request-version race protection. Zustand retains observable workflow identity and status but no navigation command payloads or counters.

**Source design:** `docs/superpowers/specs/2026-07-18-architecture-convergence-design.md`

---

## Locked File Map

### Modify

- `apps/desktop/src/app/workflowCommandCoordinator.ts`
- `apps/desktop/src/app/WorkflowCommandProvider.tsx`
- `apps/desktop/test/workflow-command-coordinator.test.mts`
- `apps/desktop/src/features/canvas/session/useCanvasSession.ts`
- `apps/desktop/src/features/canvas/CanvasView.tsx`
- `apps/desktop/src/store/canvasStore.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/TitleBar.tsx`
- `apps/desktop/src/features/workbench/WorkbenchView.tsx`
- `apps/desktop/src/lib/workflowTemplates.ts`
- Affected desktop source contracts for workbench open/new, launchpad, command palette, run panel, sharing, and continuity.

### Do Not Modify

- Persistence schema, local storage contents, API contracts, visual layout, or workflow data.
- Add-node, insert-node, or rename signals; those belong to later canvas editing/controller slices.

---

## Task 1: Add Queueable Navigation Commands to the Pure Coordinator

- [ ] Add failing unit tests for argument delivery, delivery after late registration, latest-intent replacement, promise settlement, and stale cleanup.
- [ ] Extend command and handler interfaces with `openWorkflow(workflowId)` and `createDraft(input)`.
- [ ] Keep save/publish/share/test-run harmless when no canvas is active; queue only navigation intent.
- [ ] Run unit tests and desktop typecheck.
- [ ] Commit with `feat: queue workflow navigation commands`.

## Task 2: Expose Navigation Commands Through the React Provider

- [ ] Extend the provider contract to require argument forwarding for both new commands.
- [ ] Update handler refs and registration wrappers without making the context value unstable.
- [ ] Run provider contract, coordinator tests, and desktop typecheck.
- [ ] Commit with `feat: provide workflow navigation commands`.

## Task 3: Give Canvas Session Explicit Open and Create Operations

- [ ] Extend the canvas-session boundary contract to require `openWorkflow` and `createDraft` controller methods and forbid open/new nonce selectors and listener refs in the hook.
- [ ] Replace hydration nonce comparisons with a request-version ref so late restore results cannot overwrite an explicit command.
- [ ] Implement `openWorkflow(id)` and `createDraft({ title, templateId })`; cancel pending autosave before either transition.
- [ ] Change the canvas reset adapter to accept an optional template id directly.
- [ ] Add a state transition such as `startDraft(title)` for observable identity/status reset without carrying a command signal.
- [ ] Run session/service tests, open/new contracts, continuity E2E, and typecheck.
- [ ] Commit with `refactor: add explicit canvas session navigation`.

## Task 4: Migrate Every Navigation Caller and Remove Store Signals

- [ ] Route Workbench open/new/template actions through `useWorkflowCommands`.
- [ ] Route TitleBar new-workflow and shared-copy opening in `App` through the same commands.
- [ ] Remove `openWorkflowId`, `openWorkflowNonce`, `newWorkflowNonce`, `newWorkflowPending`, `templateId`, and all request actions from `canvasStore`.
- [ ] Update affected source contracts to assert command dispatch and queued delivery rather than Zustand counters.
- [ ] Prove the removed signal names have no source matches.
- [ ] Run all affected contracts, unit tests, Playwright local-new/continuity/conflict tests, and typecheck.
- [ ] Commit with `refactor: replace workflow navigation nonces`.

## Task 5: Verify the Navigation Checkpoint

- [ ] Run `pnpm --filter @flux/desktop test:unit` and all architecture contracts.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm --filter @flux/desktop build`.
- [ ] Run `pnpm test:integrity`.
- [ ] Confirm the desktop process responds and port 5173 listens.
- [ ] Confirm no unrelated worktree changes are staged or removed.

---

## Exit Criteria

1. Opening a workflow, creating a blank workflow, and creating from a template each have one typed command path.
2. A command issued before canvas registration is delivered after registration and its promise settles.
3. Stale hydration cannot replace a newer explicit navigation command.
4. `canvasStore` contains observable state, not navigation events or pending command payloads.
5. Current product behavior, data, and visual presentation remain unchanged.
