import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowRecord } from "@flux/shared";
import { createSharingService } from "../src/features/sharing/application/sharingService.ts";
import type { CloudWorkflowSharingPort } from "../src/features/sharing/application/cloudWorkflowSharingPort.ts";
import type { WorkflowFilePort } from "../src/features/workspace/application/workflowFilePort.ts";
import type { WorkspaceRepositoryPort } from "../src/features/workspace/application/workspaceRepositoryPort.ts";

function record(id: string): WorkflowRecord {
  return {
    id,
    ownerId: "owner",
    workspaceId: "workspace",
    title: "客户线索",
    tags: ["sales"],
    version: 1,
    status: "draft",
    isFavorite: false,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    graph: { id: `${id}-graph` },
  };
}

function dependencies() {
  const calls: string[] = [];
  const repository = {
    async get(id: string) {
      calls.push(`get:${id}`);
      return record(id);
    },
  } as WorkspaceRepositoryPort;
  const files = {
    parse() {
      throw new Error("unused");
    },
    download(workflow: WorkflowRecord) {
      calls.push(`download:${workflow.id}`);
    },
  } satisfies WorkflowFilePort;
  const cloud: CloudWorkflowSharingPort = {
    async getShare(id) {
      calls.push(`share:get:${id}`);
      return null;
    },
    async createWorkflow(title, _graph, _tags) {
      calls.push(`cloud:create:${title}`);
      return record("cloud-copy");
    },
    async enableShare(id) {
      calls.push(`share:enable:${id}`);
      return { workflowId: id, shareId: "share-id", sharedAt: "2026-07-19T00:00:00.000Z" };
    },
    async disableShare(id) {
      calls.push(`share:disable:${id}`);
    },
    async getShared(shareId) {
      calls.push(`shared:get:${shareId}`);
      return {
        shareId,
        title: "共享流程",
        tags: [],
        version: 1,
        updatedAt: "2026-07-19T00:00:00.000Z",
        graph: { id: "shared" },
      };
    },
    async copyShared(shareId) {
      calls.push(`shared:copy:${shareId}`);
      return record("copied");
    },
  };
  return { repository, files, cloud, calls };
}

test("cloud sharing enables the existing workflow directly", async () => {
  const { repository, files, cloud, calls } = dependencies();
  const service = createSharingService(repository, files, cloud);

  const result = await service.enableShare("cloud-workflow", "cloud");

  assert.equal(result.cloudWorkflowId, null);
  assert.equal(result.share.workflowId, "cloud-workflow");
  assert.deepEqual(calls, ["share:enable:cloud-workflow"]);
});

test("local sharing creates one cloud copy before enabling its share", async () => {
  const { repository, files, cloud, calls } = dependencies();
  const service = createSharingService(repository, files, cloud);

  const result = await service.enableShare("local-workflow", "local");

  assert.equal(result.cloudWorkflowId, "cloud-copy");
  assert.equal(result.share.workflowId, "cloud-copy");
  assert.deepEqual(calls, [
    "get:local-workflow",
    "cloud:create:客户线索",
    "share:enable:cloud-copy",
  ]);
});

test("local export loads through the workspace port before download", async () => {
  const { repository, files, cloud, calls } = dependencies();
  const service = createSharingService(repository, files, cloud);

  await service.exportWorkflow("local-workflow");

  assert.deepEqual(calls, ["get:local-workflow", "download:local-workflow"]);
});

test("share status and revoke stay behind the cloud port", async () => {
  const { repository, files, cloud, calls } = dependencies();
  const service = createSharingService(repository, files, cloud);

  await service.getShare("cloud-workflow");
  await service.disableShare("cloud-workflow");

  assert.deepEqual(calls, ["share:get:cloud-workflow", "share:disable:cloud-workflow"]);
});

test("public read and authenticated copy stay behind the same cloud port", async () => {
  const { repository, files, cloud, calls } = dependencies();
  const service = createSharingService(repository, files, cloud);

  const shared = await service.getShared("share-id");
  const copied = await service.copyShared("share-id");

  assert.equal(shared.shareId, "share-id");
  assert.equal(copied.id, "copied");
  assert.deepEqual(calls, ["shared:get:share-id", "shared:copy:share-id"]);
});
