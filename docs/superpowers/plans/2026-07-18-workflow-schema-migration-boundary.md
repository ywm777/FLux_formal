# Workflow Schema Migration Boundary Implementation Plan

> **For Codex:** Execute with strict test-first checkpoints and verify every persistence adapter after migration.

**Goal:** Make `@flux/workflow-schema` the single versioned parsing and migration boundary for workflow graphs without changing the current product behavior.

**Architecture:** Keep graph revision (`version`) separate from document format (`schemaVersion`). Treat existing unversioned graphs as legacy v0, migrate them through a sequential registry to current v1, then validate with the canonical Zod schema. Desktop files, local storage, cloud writes, shared previews, canvas serialization, and execution all consume the same parser.

**Tech Stack:** TypeScript, Zod, Node test runner, React/Tauri desktop, NestJS API, pnpm monorepo.

---

### Task 1: Specify the migration contract

**Files:**
- Create: `packages/workflow-schema/test/migration.test.mts`
- Modify: `packages/workflow-schema/package.json`

1. Add failing tests proving an unversioned graph migrates to v1 without mutating its input.
2. Add tests proving current graphs are idempotent and unsupported future versions fail explicitly.
3. Run the package unit test and confirm it fails because the migration API does not exist yet.

### Task 2: Implement the canonical versioned parser

**Files:**
- Modify: `packages/workflow-schema/src/schema.ts`
- Create: `packages/workflow-schema/src/migrations.ts`
- Modify: `packages/workflow-schema/src/validate.ts`
- Modify: `packages/workflow-schema/src/index.ts`

1. Add `CURRENT_WORKFLOW_SCHEMA_VERSION` and require `schemaVersion` in the canonical schema.
2. Implement a sequential `v0 -> v1` registry that clones the root document and never mutates source data.
3. Route `parseGraph` and `safeParseGraph` through migration before current-schema validation.
4. Run migration tests and package typecheck.

### Task 3: Route graph construction and exchange through the boundary

**Files:**
- Modify: `packages/canvas-core/src/serialize.ts`
- Modify: `apps/desktop/src/features/canvas/graphBridge.ts`
- Modify: `apps/desktop/src/features/sharing/SharedWorkflowView.tsx`
- Modify: `apps/desktop/src/lib/syncAgent.ts`
- Modify: relevant typed fixtures

1. Make graph serialization normalize through `parseGraph`.
2. Emit `schemaVersion` from new canvas graphs.
3. Replace direct Zod and unchecked sync-pack reads with `safeParseGraph`/`parseGraph`.
4. Update compile-time graph fixtures to current format.
5. Run focused tests and typecheck.

### Task 4: Normalize persistence writes

**Files:**
- Modify: `apps/desktop/src/lib/localWorkspaceRepository.ts`
- Modify: `apps/api/src/modules/workflows/workflows.service.ts`
- Modify: related repository/service tests

1. Add failing adapter/service tests for legacy graph normalization and invalid graph rejection.
2. Normalize graph data at local create/update/import boundaries.
3. Normalize graph data at API create/update/copy/share boundaries before persistence or delivery.
4. Preserve repository conflict behavior and raw source data on failed migration.

### Task 5: Verify the architecture checkpoint

1. Prove there are no direct `WorkflowGraphSchema.parse/safeParse` calls outside the schema package.
2. Run schema unit tests, desktop contracts, API smoke tests, monorepo typecheck, desktop build, and `pnpm test:integrity`.
3. Confirm the running desktop process still responds and the Vite endpoint is reachable.
4. Commit only the files changed by this migration phase.
