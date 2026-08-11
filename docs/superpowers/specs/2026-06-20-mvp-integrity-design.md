# Flux MVP Integrity Design

## Objective

Move Flux from a demo-capable prototype to a verifiable MVP by closing the highest-risk integrity gaps without expanding the product surface. The work is successful when execution cannot be started with a forged graph or another user's workflow, built-in nodes do not evaluate arbitrary JavaScript in the API process, and concurrent workflow saves have an explicit, recoverable conflict contract.

## Scope

This increment covers three related boundaries:

1. Execution admission: the API resolves the workflow by ID, verifies ownership and published status, validates the stored graph, and only then creates and queues an execution.
2. Expression safety: condition expressions use a restricted evaluator; the custom-code node remains defined for compatibility but is not registered as a built-in executable node until an isolated sandbox exists.
3. Save concurrency: stale writes return HTTP 409 with machine-readable conflict metadata. The desktop client uses the returned server version when the user explicitly chooses to keep the local graph.

Out of scope are a general JavaScript sandbox, retries and pause/resume redesign, offline queue integration, new UI, scheduler implementation, and infrastructure deployment.

## Architecture

### Execution Admission

`ExecutionsService.start` accepts only `ownerId` and `workflowId`. It loads the workflow from `WorkflowsRepository`, returns not-found semantics for missing or foreign records, rejects drafts, parses the persisted graph through `WorkflowGraphSchema`, rejects structural issues, compiles the DAG to reject cycles, then creates the execution record and enqueues the normalized graph. The controller and desktop API stop sending a client-supplied graph.

This makes the persisted published workflow the single execution source of truth and keeps authorization in the service boundary where it can be tested independently of HTTP.

### Safe Conditions

A focused expression module tokenizes and parses the subset needed by the current UI examples:

- values: `input`, nested property access, strings, numbers, booleans, and `null`
- comparison: `===`, `!==`, `==`, `!=`, `>`, `>=`, `<`, `<=`
- boolean composition: `&&`, `||`, unary `!`, and parentheses

The evaluator never calls `eval`, `Function`, property getters outside plain path traversal, or arbitrary methods. Invalid syntax is reported as a node execution error. `customCodeNode` is removed from `builtinNodes`, so existing graphs fail closed as an unregistered node and new graphs cannot add it from the palette.

### Conflict Contract

`WorkflowsService.update` translates `WorkflowVersionConflictError` into `ConflictException` with this response body:

```json
{
  "statusCode": 409,
  "code": "WORKFLOW_VERSION_CONFLICT",
  "message": "工作流版本冲突：当前 v3，提交基于 v2",
  "currentVersion": 3,
  "expectedVersion": 2
}
```

`ApiError` retains the parsed response body. `CanvasView` only opens the conflict dialog for code `WORKFLOW_VERSION_CONFLICT`, displays `currentVersion`, and on "keep local" first advances the local persistence version to that server version before retrying. A second concurrent update can still produce another 409, which is correct and recoverable.

For PostgreSQL, the repository update becomes a conditional `UPDATE ... WHERE id = :id AND version = :expectedVersion` so the optimistic lock is atomic. A zero-row update distinguishes deletion from a version conflict by re-reading the current record.

## Error Handling

- Missing or foreign workflow: 404, avoiding ownership disclosure.
- Draft workflow execution: 409 with a clear publish-first message.
- Invalid graph or cyclic DAG: 400 before an execution record is created.
- Unknown node type, including custom code: execution fails closed with the existing node-level error path.
- Stale workflow update: 409 with stable code and both version values.

## Verification

Tests use Node's strict assertions in compiled smoke suites, matching the repository's current lightweight test style while ensuring assertion failures exit non-zero. Coverage includes restricted expression behavior and rejection, execution ownership/publish/validation gates, conflict exception payload, and stale-version repository behavior. Final verification runs package tests, monorepo typecheck, and production builds.

## Compatibility

The execution request body narrows from `{ workflowId, graph }` to `{ workflowId }`; the desktop client is updated in the same change. Existing persisted workflow records remain compatible. Existing custom-code graphs are retained but cannot execute until a sandboxed carrier is implemented.
