import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkflowVersionConflictError,
  type WorkspaceRepositoryPort,
} from "../src/features/workspace/application/workspaceRepositoryPort.ts";

test("workspace repository port exposes the complete persistence capability", () => {
  const repository: WorkspaceRepositoryPort = {
    list: async () => [],
    get: async () => {
      throw new Error("not implemented");
    },
    create: async () => {
      throw new Error("not implemented");
    },
    update: async () => {
      throw new Error("not implemented");
    },
    publish: async () => {
      throw new Error("not implemented");
    },
    favorite: async () => {
      throw new Error("not implemented");
    },
    remove: async () => ({ ok: false }),
    importLocal: async () => {
      throw new Error("not implemented");
    },
    copyCloudRecordToLocal: async () => {
      throw new Error("not implemented");
    },
  };

  assert.deepEqual(Object.keys(repository), [
    "list",
    "get",
    "create",
    "update",
    "publish",
    "favorite",
    "remove",
    "importLocal",
    "copyCloudRecordToLocal",
  ]);
});

test("workflow version conflicts have one infrastructure-neutral shape", () => {
  const error = new WorkflowVersionConflictError(7, 5);

  assert.equal(error.name, "WorkflowVersionConflictError");
  assert.equal(error.currentVersion, 7);
  assert.equal(error.expectedVersion, 5);
  assert.match(error.message, /v7/);
  assert.match(error.message, /v5/);
});
