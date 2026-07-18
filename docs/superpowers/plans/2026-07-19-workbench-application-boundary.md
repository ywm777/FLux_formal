# Workbench Application Boundary Implementation Plan

**Goal:** Remove concrete repository and workflow-file infrastructure calls from `WorkbenchView` while preserving all current interactions.

**Architecture:** A pure `WorkbenchService` coordinates `WorkspaceRepositoryPort` and a new `WorkflowFilePort`. The app composition root wires the browser file adapter to that service and exposes it through context. React keeps only file selection, local UI state, navigation, and user-facing errors.

---

### Task 1: Specify the workbench use cases

1. Add unit tests for export, import, and parse-failure behavior.
2. Confirm the tests fail before the application service exists.

### Task 2: Add the application and infrastructure ports

1. Define `WorkflowFilePort` under the workbench application boundary.
2. Implement the pure `WorkbenchService` against `WorkspaceRepositoryPort` and `WorkflowFilePort`.
3. Add a browser adapter around the existing `.flux` parser/downloader.

### Task 3: Compose and migrate the page

1. Wire the service in `WorkspaceServiceProvider`.
2. Replace direct repository/file calls in `WorkbenchView` with application use cases.
3. Update behavior contracts to assert the new dependency direction.

### Task 4: Verify

1. Prove `WorkbenchView` no longer imports repository or workflow-file infrastructure.
2. Run unit tests, affected contracts, typecheck, build, integrity tests, and the running-app check.
