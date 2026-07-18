# Sharing Application Boundary Implementation Plan

**Goal:** Move local export, cloud-copy creation, share status, enable, and revoke orchestration out of `ShareWorkflowDialog`.

**Architecture:** A pure `SharingService` depends on the existing workspace repository port, a shared workflow-file port, and a cloud sharing port. The app composition root wires browser/cloud adapters. React retains authentication prompts, confirmation state, focus management, clipboard behavior, and error presentation.

---

1. Add failing application-service tests for cloud sharing, local-to-cloud sharing, export, and revoke.
2. Move the workflow-file port from the workbench feature to the workspace application boundary so both workbench and sharing can depend on it without feature-to-feature coupling.
3. Add a cloud sharing port and API adapter.
4. Compose `SharingService` in `WorkspaceServiceProvider`.
5. Replace all concrete repository/API/file imports in `ShareWorkflowDialog`.
6. Update sharing and local-first contracts, then run unit, type, build, integrity, and live-app verification.
