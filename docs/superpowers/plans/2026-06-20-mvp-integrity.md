# Flux MVP Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only execute authorized published server graphs, remove in-process arbitrary JavaScript evaluation, and expose recoverable HTTP 409 version conflicts.

**Architecture:** Put execution admission in `ExecutionsService`, restricted condition parsing in node-sdk, and version-conflict translation in `WorkflowsService`. Preserve the existing repository and desktop patterns.

**Tech Stack:** TypeScript, NestJS, TypeORM, Zod, React, Zustand, Node strict assertions.

---

### Task 1: Restricted Expressions

**Files:** Create `packages/node-sdk/src/builtin/expression.ts`, `expression.smoke.ts`; modify `builtin/index.ts`, `builtin/custom-code.ts`.

- [x] Write failing assertions for paths, comparisons, booleans, parentheses, missing values, and rejected function calls.
- [x] Build node-sdk and verify failure because the evaluator is missing.
- [x] Implement a closed tokenizer/parser for literals, `input` paths, comparison, `!`, `&&`, `||`, and parentheses.
- [x] Replace `new Function`; hide and fail-close custom code until a sandbox exists.
- [x] Build and run the expression smoke suite.

### Task 2: Execution Admission

**Files:** Create `apps/api/src/modules/executions/executions.service.smoke.ts`; modify execution service/controller and desktop API.

- [x] Write failing in-memory tests for missing/foreign IDs, drafts, malformed/cyclic graphs, and successful queueing of the persisted graph.
- [x] Verify the tests fail while `start` still trusts a client graph.
- [x] Require ownership and published state; parse, validate, and compile before creating an execution.
- [x] Narrow HTTP and desktop requests to `{ workflowId }`.
- [x] Build and run the execution service smoke suite.

### Task 3: Conflict Contract

**Files:** Create `apps/api/src/modules/workflows/workflows.service.smoke.ts`; modify workflow service, TypeORM repository, desktop API/store/canvas, and `docs/sync-protocol.md`.

- [x] Write a failing stale-write test expecting 409, `WORKFLOW_VERSION_CONFLICT`, `currentVersion`, and `expectedVersion`.
- [x] Verify the raw repository error currently escapes.
- [x] Translate the error and make versioned PostgreSQL updates atomic.
- [x] Preserve API error details and use the current server version for keep-local retry.
- [x] Update protocol documentation and run the service smoke suite.

### Task 4: Verification

**Files:** Modify `package.json`, `apps/api/src/database/database.smoke.ts`.

- [x] Make existing smoke assertions fatal.
- [x] Add `test:integrity` to build and run all smoke suites.
- [x] Run `pnpm test:integrity`.
- [x] Confirm executable source contains no `new Function` or `eval`.
- [x] Run `pnpm typecheck` and `pnpm build`.

## Working Tree Note

Target files already contain uncommitted user work. Do not auto-commit or broadly format; preserve unrelated changes.
