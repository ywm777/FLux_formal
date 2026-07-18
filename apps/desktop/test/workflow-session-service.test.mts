import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkflowVersionConflictError,
  type WorkspaceRepositoryPort,
} from "../src/features/workspace/application/workspaceRepositoryPort.ts";
import { createWorkflowSessionService } from "../src/features/workspace/application/workflowSessionService.ts";
import type { WorkflowRecord, WorkflowSummary } from "@flux/shared";

function workflowRecord(
  id: string,
  updatedAt: string,
  overrides: Partial<WorkflowRecord> = {},
): WorkflowRecord {
  return {
    id,
    ownerId: "owner",
    workspaceId: "workspace",
    title: id,
    tags: [],
    version: 1,
    status: "draft",
    isFavorite: false,
    createdAt: updatedAt,
    updatedAt,
    graph: { id },
    ...overrides,
  };
}

function summary(record: WorkflowRecord): WorkflowSummary {
  const { graph: _graph, ...value } = record;
  return value;
}

function memoryRepository(records: WorkflowRecord[] = []) {
  const calls: string[] = [];
  const stored = new Map(records.map((record) => [record.id, record]));
  const repository: WorkspaceRepositoryPort = {
    async list() {
      calls.push("list");
      return [...stored.values()].map(summary);
    },
    async get(id) {
      calls.push(`get:${id}`);
      const record = stored.get(id);
      if (!record) throw new Error("missing workflow");
      return structuredClone(record);
    },
    async create(title, graph) {
      calls.push(`create:${title}`);
      const record = workflowRecord("created", "2026-07-18T12:00:00.000Z", {
        title,
        graph,
      });
      stored.set(record.id, record);
      return structuredClone(record);
    },
    async update(id, patch) {
      calls.push(`update:${id}:v${patch.expectedVersion}`);
      const current = stored.get(id);
      if (!current) throw new Error("missing workflow");
      const record = {
        ...current,
        ...patch,
        version: current.version + 1,
        updatedAt: "2026-07-18T13:00:00.000Z",
      };
      stored.set(id, record);
      return structuredClone(record);
    },
    async publish(id) {
      calls.push(`publish:${id}`);
      const current = stored.get(id);
      if (!current) throw new Error("missing workflow");
      const record = { ...current, status: "published" as const };
      stored.set(id, record);
      return structuredClone(record);
    },
    async favorite(id, isFavorite) {
      const current = stored.get(id);
      if (!current) throw new Error("missing workflow");
      return { ...current, isFavorite };
    },
    async remove(id) {
      return { ok: stored.delete(id) };
    },
    async importLocal(input) {
      return this.create(input.title, input.graph, input.tags);
    },
    async copyCloudRecordToLocal(record) {
      return this.create(record.title, record.graph, record.tags);
    },
  };
  return { repository, calls };
}

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

test("restore opens an explicitly requested workflow without listing", async () => {
  const requested = workflowRecord("requested", "2026-07-18T10:00:00.000Z");
  const { repository, calls } = memoryRepository([requested]);
  const session = createWorkflowSessionService(repository);

  const result = await session.restore({
    requestedWorkflowId: requested.id,
    pendingNewWorkflow: false,
  });

  assert.deepEqual(result, {
    kind: "record",
    record: requested,
    preserveDirtyTitle: false,
  });
  assert.deepEqual(calls, ["get:requested"]);
});

test("restore preserves a pending new draft", async () => {
  const { repository, calls } = memoryRepository([
    workflowRecord("existing", "2026-07-18T10:00:00.000Z"),
  ]);
  const session = createWorkflowSessionService(repository);

  const result = await session.restore({
    requestedWorkflowId: null,
    pendingNewWorkflow: true,
  });

  assert.deepEqual(result, { kind: "draft" });
  assert.deepEqual(calls, []);
});

test("restore chooses the most recently updated workflow", async () => {
  const older = workflowRecord("older", "2026-07-18T10:00:00.000Z");
  const latest = workflowRecord("latest", "2026-07-18T11:00:00.000Z");
  const { repository, calls } = memoryRepository([older, latest]);
  const session = createWorkflowSessionService(repository);

  const result = await session.restore({
    requestedWorkflowId: null,
    pendingNewWorkflow: false,
  });

  assert.deepEqual(result, {
    kind: "record",
    record: latest,
    preserveDirtyTitle: true,
  });
  assert.deepEqual(calls, ["list", "get:latest"]);
});

test("save creates the first record and updates an existing version", async () => {
  const existing = workflowRecord("existing", "2026-07-18T10:00:00.000Z", {
    version: 4,
  });
  const { repository, calls } = memoryRepository([existing]);
  const session = createWorkflowSessionService(repository);

  await session.save({
    workflowId: null,
    version: 0,
    title: "First",
    graph: { nodes: [] },
  });
  await session.save({
    workflowId: existing.id,
    version: existing.version,
    title: "Updated",
    graph: { nodes: ["node"] },
  });

  assert.deepEqual(calls, ["create:First", "update:existing:v4"]);
});

test("publish persists the current graph before publishing", async () => {
  const existing = workflowRecord("existing", "2026-07-18T10:00:00.000Z", {
    version: 3,
  });
  const { repository, calls } = memoryRepository([existing]);
  const session = createWorkflowSessionService(repository);

  const published = await session.publish({
    workflowId: existing.id,
    version: existing.version,
    title: "Ready",
    graph: { nodes: ["current"] },
  });

  assert.equal(published.status, "published");
  assert.deepEqual(calls, ["update:existing:v3", "publish:existing"]);
});
