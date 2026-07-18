import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowRecord } from "@flux/shared";
import { createWorkbenchService } from "../src/features/workbench/application/workbenchService.ts";
import type { WorkspaceRepositoryPort } from "../src/features/workspace/application/workspaceRepositoryPort.ts";
import type { WorkflowFilePort } from "../src/features/workbench/application/workflowFilePort.ts";

function record(graph: unknown = { id: "graph" }): WorkflowRecord {
  return {
    id: "workflow-1",
    ownerId: "owner",
    workspaceId: "workspace",
    title: "客户线索",
    tags: ["sales"],
    version: 1,
    status: "draft",
    isFavorite: false,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    graph,
  };
}

function dependencies() {
  const calls: string[] = [];
  const repository = {
    async get(id: string) {
      calls.push(`get:${id}`);
      return record();
    },
    async importLocal(input) {
      calls.push(`import:${input.title}`);
      return record(input.graph);
    },
  } as WorkspaceRepositoryPort;
  const files: WorkflowFilePort = {
    parse(source) {
      calls.push(`parse:${source}`);
      return { title: "导入流程", tags: ["imported"], graph: { id: "imported" } };
    },
    download(workflow) {
      calls.push(`download:${workflow.id}`);
    },
  };
  return { repository, files, calls };
}

test("export loads the record before handing it to the file adapter", async () => {
  const { repository, files, calls } = dependencies();
  const service = createWorkbenchService(repository, files);

  await service.exportWorkflow("workflow-1");

  assert.deepEqual(calls, ["get:workflow-1", "download:workflow-1"]);
});

test("import parses once and persists through the local repository capability", async () => {
  const { repository, files, calls } = dependencies();
  const service = createWorkbenchService(repository, files);

  const imported = await service.importWorkflow("file contents");

  assert.equal(imported.id, "workflow-1");
  assert.deepEqual(calls, ["parse:file contents", "import:导入流程"]);
});

test("parse failure stops before repository mutation", async () => {
  const { repository, files, calls } = dependencies();
  files.parse = () => {
    calls.push("parse:failed");
    throw new Error("invalid file");
  };
  const service = createWorkbenchService(repository, files);

  await assert.rejects(() => service.importWorkflow("bad"), /invalid file/);
  assert.deepEqual(calls, ["parse:failed"]);
});
