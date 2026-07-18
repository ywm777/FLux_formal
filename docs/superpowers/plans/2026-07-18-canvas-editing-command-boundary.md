# Canvas Editing Command Boundary Implementation Plan

**Goal:** Remove the final Zustand command counters by routing add-node, typed node insertion, and workflow rename through the typed workflow command coordinator.

**Architecture:** These commands are canvas-scoped and therefore remain harmless when no canvas handler is active. `CanvasView` registers direct callbacks using its current ReactFlow instance and editing closures. Zustand retains only observable workflow/session status.

## Task 1: Extend the Pure Command Boundary

- [ ] Add failing coordinator tests for `addNode`, `insertNodeType`, and `renameWorkflow`.
- [ ] Extend command/handler types and Provider forwarding.
- [ ] Run unit/provider tests and typecheck after Canvas registration is migrated.

## Task 2: Migrate TitleBar and Canvas

- [ ] Route command-palette node insertion, add node, and rename plus the visible title rename control through `WorkflowCommands`.
- [ ] Register direct Canvas handlers preserving viewport-center insertion and palette behavior.
- [ ] Delete the three nonce listeners and all six signal fields/actions from `canvasStore`.
- [ ] Update global command palette and node-insertion contracts.
- [ ] Prove no `*Nonce` field remains in `canvasStore` and no legacy action name remains in desktop source.
- [ ] Commit atomically with `refactor: replace canvas editing command nonces`.

## Task 3: Verify the Store Cleanup Checkpoint

- [ ] Run affected contracts and unit tests.
- [ ] Run full typecheck, desktop build, and integrity suite.
- [ ] Confirm the running desktop process and Vite listener.
